import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator, Alert, FlatList,
    Image,
    KeyboardAvoidingView, Modal, Platform, SafeAreaView,
    ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';

// --- CONFIGURAZIONE CHIAVI ---
const WEATHER_API_KEY = 'b9f05ba6cff60cec20886ba24b486241'; 
const OPENAI_API_KEY = '[REMOVED_OPENAI_KEY]'; 
const supabaseUrl = 'https://azkpckrybldypqwdksjc.supabase.co';
const supabaseKey = 'sb_publishable_b9EMDrQXatPARFQrhpoTVA_gQdx7kgq';
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

// --- PROMPT DI BACKUP (Se non va internet/db) ---
const BACKUP_SYSTEM_PROMPT = `Sei un Agronomo Esperto.
1. Se vedi erbacce/trifoglio: Diagnostica INFESTANTI -> CONSIGLIO CATEGORIA: DISERBANTE.
2. Se vedi macchie: Diagnostica FUNGHI -> CONSIGLIO CATEGORIA: FUNGICIDA.
3. Se vedi giallo: Diagnostica CARENZA -> CONSIGLIO CATEGORIA: CONCIME.`;

// --- TEMA GRAFICO ---
const THEME = {
  headerBg: '#FFFFFF', bg: '#F5F7FA', card: '#FFFFFF',
  textDark: '#1B5E20', accent: '#00C853', primary: '#1A237E',
  danger: '#D32F2F', warning: '#FF9800', info: '#2196F3',
  secondary: '#ECEFF1', iconInactive: '#B0BEC5', tableHeader: '#E0E0E0',
  fogliare: '#E8F5E9', radicale: '#FFF3E0',
  ai: '#7C4DFF',
  highlight: '#00E676'
};

// --- EVIDENZIATORE ---
const HighlightText = ({ text, term, baseStyle }) => {
    if (!text) return null;
    const str = String(text);
    if (!term || term.trim().length < 2) return <Text style={baseStyle}>{str}</Text>;
    const parts = str.split(new RegExp(`(${term})`, 'gi'));
    return (
        <Text style={baseStyle}>
            {parts.map((part, i) => 
                part.toLowerCase() === term.toLowerCase() 
                ? <Text key={i} style={{ backgroundColor: THEME.highlight, color: '#000' }}>{part}</Text>
                : <Text key={i}>{part}</Text>
            )}
        </Text>
    );
};

const BrandLogo = ({scale = 1}) => (
  <View style={{alignItems:'center', transform: [{scale}]}}>
    <Text style={{fontSize:24, fontWeight:'900', color:THEME.textDark}}>AgriManager</Text>
    <Text style={{fontSize:10, color:THEME.accent, fontWeight:'bold', letterSpacing:1}}>powered by SINELICA</Text>
  </View>
);

// --- FUNZIONI COSMETICHE ---
const getCategoryColor = (categoria) => {
    if (!categoria) return '#90A4AE';
    const c = categoria.toUpperCase();
    if (c.includes('FUNGICIDA') || c.includes('DISERBANTE') || c.includes('INSETTICIDA')) return '#D32F2F'; 
    if (c.includes('CONCIME') || c.includes('FERTILIZZANTE')) return '#2E7D32'; 
    if (c.includes('BIO') || c.includes('STIMOLANTE')) return '#FF8F00'; 
    if (c.includes('SEMENTI') || c.includes('PRATO')) return '#1565C0'; 
    return '#607D8B';
};

const shouldShowBrand = (categoria) => {
    if (!categoria) return true;
    const c = categoria.toUpperCase();
    if (c.includes('FUNGICIDA') || c.includes('DISERBANTE') || c.includes('INSETTICIDA') || c.includes('PFNPE')) return false;
    return true; 
};

const getCleanCategoryName = (categoria) => {
    if (!categoria) return '';
    const c = categoria.toUpperCase();
    if (c.includes('CONCIME')) return 'NUTRIZIONE'; 
    if (c.includes('FUNGICIDA')) return 'FUNGICIDA';
    if (c.includes('DISERBANTE')) return 'DISERBANTE';
    if (c.includes('INSETTICIDA')) return 'INSETTICIDA';
    if (c.includes('SEMENTI')) return 'SEMENTI';
    return c;
};

const isPharmacyCategory = (cat) => {
    if(!cat) return false;
    const c = cat.toUpperCase();
    return c.includes('FUNGICIDA') || c.includes('DISERBANTE') || c.includes('INSETTICIDA') || c.includes('PFNPE');
};

const getDisplayUnit = (unit) => {
    if(!unit) return '';
    const u = unit.toLowerCase();
    if(u === 'ml' || u === 'l' || u === 'lt') return 'L';
    if(u === 'g' || u === 'kg') return 'Kg';
    return unit;
};

// --- LOGICA METEO AGRONOMICO ---
const getAgronomicAdvice = (weather) => {
    if (!weather) return { status: '...', advice: '...', color: '#999' };

    const temp = weather.main.temp;
    const main = weather.weather[0].main; 
    const id = weather.weather[0].id; 

    if (main === 'Snow' || temp <= 5) {
        return { status: '❄️ RIPOSO INVERNALE', advice: 'Prato dormiente. Non tagliare.', color: '#90A4AE' };
    }
    if (main === 'Rain' || main === 'Drizzle' || main === 'Thunderstorm') {
        return { status: '🌧️ PIOGGIA', advice: 'Spegni irrigazione. No trattamenti.', color: '#42A5F5' };
    }
    if (temp > 5 && temp < 12) {
        return { status: '💤 BASSA CRESCITA', advice: 'Taglio alto. Assorbimento lento.', color: '#7986CB' };
    }
    if (temp >= 28) {
        return { status: '🔥 STRESS TERMICO', advice: 'Irriga mattina. Alza taglio.', color: '#D32F2F' };
    }
    return { status: '✅ TEMPO IDEALE', advice: 'Ottimo per taglio e concime.', color: '#2E7D32' };
};

export default function App() {
  const [appIsReady, setAppIsReady] = useState(false);
  const [userRole, setUserRole] = useState(null); 
  const [session, setSession] = useState(null);
  const [isPendingApproval, setIsPendingApproval] = useState(false);

  // --- BIG DATA & METEO & AI ---
  const [deviceId, setDeviceId] = useState(null);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [welcomeData, setWelcomeData] = useState({ tipo: 'HOBBISTA', citta: '', mq: '' });
  const [weatherData, setWeatherData] = useState(null); 
   
  // AI STATES
  const [showContextModal, setShowContextModal] = useState(false); 
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiImage, setAiImage] = useState(null);
  const [aiContextData, setAiContextData] = useState({ date: '', city: '', plantType: '' }); 
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiRecommendedProducts, setAiRecommendedProducts] = useState([]); 
  const [activeSystemPrompt, setActiveSystemPrompt] = useState(BACKUP_SYSTEM_PROMPT); // <--- STATO PROMPT

  // AUTH
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regCompany, setRegCompany] = useState('');
  const [showRegDropdown, setShowRegDropdown] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [availableBrands, setAvailableBrands] = useState([]);

  // SHOP
  const [productsDB, setProductsDB] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('TUTTI'); 
  const [selectedCategory, setSelectedCategory] = useState('TUTTI');
  const [cartItems, setCartItems] = useState([]); 
  const [showCartModal, setShowCartModal] = useState(false);
  const [mixItems, setMixItems] = useState([]); 
  const [showMixListModal, setShowMixListModal] = useState(false);
  const [customerName, setCustomerName] = useState(''); 
   
  // EXTRA
  const [showSOSModal, setShowSOSModal] = useState(false);
  const [sosSearch, setSosSearch] = useState(''); 
  const [showFavModal, setShowFavModal] = useState(false); 
  const [selectedProduct, setSelectedProduct] = useState(null); 
  const [lawnSize, setLawnSize] = useState(''); 
  const [favorites, setFavorites] = useState([]);
  const [inputCodicePartner, setInputCodicePartner] = useState('');
  const [activePartners, setActivePartners] = useState([]); 
  const [clientAlerts, setClientAlerts] = useState([]);
  const [selectedAlert, setSelectedAlert] = useState(null); 

  // AGENT
  const [agentProfileId, setAgentProfileId] = useState(null); 
  const [agentTab, setAgentTab] = useState('CODES'); 
  const [agentCodes, setAgentCodes] = useState([]); 
  const [editingId, setEditingId] = useState(null);
  const [newCodeData, setNewCodeData] = useState({ descrizione_interna: '', codice_sconto: '', s_sementi: '', s_granulari: '', s_liquidi: '' });
  const [alertMessage, setAlertMessage] = useState('');
  const [alertProducts, setAlertProducts] = useState([]); 
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [sentAlerts, setSentAlerts] = useState([]);

  // --- INIT ---
  useEffect(() => { 
    checkUserIdentity().then((id) => {
        if(id) loadUserProfile(id);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      loadCommonData().then(() => { if(session) initAppAgente(session); else initAppCliente(); });
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if(session) initAppAgente(session);
      else { setUserRole(null); setAgentCodes([]); setSentAlerts([]); setIsPendingApproval(false); setAgentProfileId(null); }
    });
  }, []);

  // --- LOGICA USER & METEO ---
  const checkUserIdentity = async () => {
      try {
          let id = await AsyncStorage.getItem('DEVICE_ID');
          if (!id) {
              id = 'user_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
              await AsyncStorage.setItem('DEVICE_ID', id);
          }
          setDeviceId(id);
          return id;
      } catch (e) { console.log("Errore ID", e); return null; }
  };

  const loadUserProfile = async (id) => {
      const { data, error } = await supabase.from('profili_anonimi').select('*').eq('device_id', id).single();
      if (data) {
          setWelcomeData({ tipo: data.tipo_utente, citta: data.citta_base, mq: data.mq_prato_default?.toString() || '' });
          if(data.mq_prato_default) {
              setLawnSize(data.mq_prato_default.toString());
              AsyncStorage.setItem('LAWN_SIZE', data.mq_prato_default.toString());
          }
          if(data.citta_base) {
              fetchWeather(data.citta_base);
          }
      }
  };

  const fetchWeather = async (city) => {
      if(!city) return;
      try {
          const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${WEATHER_API_KEY}&units=metric&lang=it`);
          const data = await response.json();
          if(data.cod === 200) {
              setWeatherData(data);
              trackEvent('METEO_CHECK', `Città: ${city}, Temp: ${data.main.temp}°C, Desc: ${data.weather[0].description}`);
          }
      } catch(e) { console.log("Errore Meteo", e); }
  };

  // --- FUNZIONI AI AGGIORNATA (FETCH PROMPT DA DB) ---
  const handlePhotoAction = () => {
      Alert.alert("Nuova Diagnosi", "Scegli la fonte dell'immagine:", [
          { text: "Annulla", style: "cancel" },
          { text: "🖼️ Galleria", onPress: () => pickImage('gallery') },
          { text: "📸 Fotocamera", onPress: () => pickImage('camera') }
      ]);
  };

  const pickImage = async (mode) => {
      setAiRecommendedProducts([]); 
      let result;
      if (mode === 'camera') {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') { Alert.alert("Permesso negato", "Abilita la fotocamera."); return; }
          result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 1, base64: true });
      } else {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') { Alert.alert("Permesso negato", "Abilita la galleria."); return; }
          result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 1, base64: true });
      }

      if (!result.canceled && result.assets && result.assets.length > 0) {
          setAiImage(result.assets[0]);
          const today = new Date().toISOString().split('T')[0];
          setAiContextData({ date: today, city: welcomeData.citta || '', plantType: '' });
          setShowContextModal(true);
      }
  };

  const startAnalysis = async () => {
      setShowContextModal(false);
      setAiAnalyzing(true);
      setShowAIModal(true);
      setAiResult(null);
      setAiRecommendedProducts([]);

      let weatherContext = "Dato Meteo non disponibile.";
      const today = new Date().toISOString().split('T')[0];
       
      if (aiContextData.date === today && aiContextData.city) {
          try {
              const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${aiContextData.city}&appid=${WEATHER_API_KEY}&units=metric&lang=it`);
              const wData = await response.json();
              if(wData.cod === 200) {
                  weatherContext = `CONTESTO LIVE: Città: ${wData.name}, Temp: ${wData.main.temp}°C, Umidità: ${wData.main.humidity}%`;
              }
          } catch(e) { console.log("Err Meteo AI", e); }
      }

      let plantContext = "";
      if (aiContextData.plantType && aiContextData.plantType.trim() !== "") {
          plantContext = `L'utente dichiara che la pianta è: ${aiContextData.plantType}. Usalo come base per la diagnosi.`;
      }

      try {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
              body: JSON.stringify({
                  model: "gpt-4o-mini",
                  messages: [
                      {
                          role: "system",
                          content: activeSystemPrompt // <--- USA IL PROMPT DAL DB (o BACKUP)
                      },
                      {
                          role: "user",
                          content: [
                              { type: "text", text: `Analizza questa immagine. ${plantContext} ${weatherContext}` },
                              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${aiImage.base64}` } }
                          ]
                      }
                  ],
                  max_tokens: 600
              })
          });

          const data = await response.json();
          if(data.error) { setAiResult(`Errore AI: ${data.error.message}`); } 
          else if(data.choices && data.choices.length > 0) {
              const diagnosis = data.choices[0].message.content;
              setAiResult(diagnosis);
              trackEvent('DIAGNOSI_AI', `Successo`);

              let keyword = '';
              const dUpper = diagnosis.toUpperCase();
              
              if (dUpper.includes('DISERBANTE') || dUpper.includes('INFESTANTI') || dUpper.includes('ERBACCE') || dUpper.includes('TRIFOGLIO') || dUpper.includes('MALERBE')) keyword = 'DISERBANTE';
              else if (dUpper.includes('FUNGICIDA') || dUpper.includes('FUNGHI') || dUpper.includes('OIDIO') || dUpper.includes('TICCHIOLATURA')) keyword = 'FUNGICIDA';
              else if (dUpper.includes('INSETTICIDA') || dUpper.includes('AFIDI') || dUpper.includes('COCCINIGLIA') || dUpper.includes('RAGNETTO')) keyword = 'INSETTICIDA';
              else if (dUpper.includes('CONCIME') || dUpper.includes('CARENZA') || dUpper.includes('FERRO') || dUpper.includes('CLOROSI') || dUpper.includes('NUTR')) keyword = 'CONCIME';

              if (keyword) {
                  let recs = productsDB.filter(p => p.categoria && p.categoria.toUpperCase().includes(keyword));
                   
                  if (activePartners.length > 0) {
                      const allowedBrands = activePartners.map(ap => ap.azienda.toUpperCase());
                      recs = recs.filter(p => {
                          if (isPharmacyCategory(p.categoria)) return true;
                          return allowedBrands.includes(p.marca.toUpperCase());
                      });
                  }

                  if(keyword === 'CONCIME') {
                      recs = recs.filter(p => !isPharmacyCategory(p.categoria) && (p.categoria.toUpperCase().includes('CONCIME') || p.categoria.toUpperCase().includes('BIO') || p.categoria.toUpperCase().includes('BOTTOS')));
                  }
                  setAiRecommendedProducts(recs.slice(0, 5)); 
              }
          } else { setAiResult("Non riesco a identificare il problema."); }
      } catch (error) { setAiResult("Errore di connessione."); } finally { setAiAnalyzing(false); }
  };

  const handleEnterShop = async () => { setUserRole('CLIENTE'); const hasProfile = await AsyncStorage.getItem('HAS_PROFILE_DATA'); if (!hasProfile) setShowWelcomeModal(true); };
   
  const saveWelcomeData = async () => {
      if(!welcomeData.citta) return Alert.alert("Manca la città", "Inserisci la tua zona.");
      try {
          await supabase.from('profili_anonimi').upsert({ device_id: deviceId, tipo_utente: welcomeData.tipo, citta_base: welcomeData.citta, mq_prato_default: parseFloat(welcomeData.mq) || 0, ultimo_accesso: new Date() });
          await AsyncStorage.setItem('HAS_PROFILE_DATA', 'true'); 
          if(welcomeData.mq) { setLawnSize(welcomeData.mq); AsyncStorage.setItem('LAWN_SIZE', welcomeData.mq); }
          fetchWeather(welcomeData.citta);
          trackEvent('REGISTRAZIONE_PROFILO', `Tipo: ${welcomeData.tipo}`);
          setShowWelcomeModal(false);
      } catch (e) { Alert.alert("Errore", "Riprova."); }
  };

  const handleUpdateProfile = async () => {
      if(!welcomeData.citta) return Alert.alert("Manca la città", "Inserisci la tua zona.");
      try {
          await supabase.from('profili_anonimi').upsert({ device_id: deviceId, tipo_utente: welcomeData.tipo, citta_base: welcomeData.citta, mq_prato_default: parseFloat(welcomeData.mq) || 0, ultimo_accesso: new Date() });
          if(welcomeData.mq) { setLawnSize(welcomeData.mq); AsyncStorage.setItem('LAWN_SIZE', welcomeData.mq); }
          fetchWeather(welcomeData.citta);
          Alert.alert("Fatto", "Profilo aggiornato!");
          setShowSettingsModal(false);
      } catch (e) { Alert.alert("Errore", "Riprova."); }
  };

  const trackEvent = async (action, detail, numericValue = 0) => { if(!deviceId) return; supabase.from('tracking_eventi').insert({ device_id: deviceId, tipo_azione: action, dettaglio: detail, valore_numerico: numericValue }).then(); };
  const handleDismissAlert = () => { setSelectedAlert(null); setClientAlerts([]); }; 
  const handlePostponeAlert = () => { setSelectedAlert(null); }; 

  const getSearchScore = (item, term) => {
      if (!term) return { qty: 0, count: 0 };
      const t = term.toLowerCase();
      const text = `${item.nome} ${item.descrizione||''} ${item.composizione||''} ${item.categoria||''}`.toLowerCase();
      const count = text.split(t).length - 1;
      if (count === 0) return { qty: 0, count: 0 };
      const match = text.match(new RegExp(`${t}[^0-9]{0,15}?([0-9]+([.,][0-9]+)?)`));
      const qty = match ? parseFloat(match[1].replace(',', '.')) : 0;
      return { qty, count };
  };

  const loadCommonData = async () => {
      // 1. CARICA PRODOTTI
      const { data } = await supabase.from('Prodotti').select('*').order('marca').order('nome');
      if(data) {
          setProductsDB(data);
          const sosCats = ['FUNGICIDA', 'DISERBANTE', 'INSETTICIDA', 'FUNGICIDA BIO', 'DISERBANTE PFnPE', 'INSETTICIDA PFnPE'];
          const brands = [...new Set(data.filter(p => !sosCats.includes(p.categoria.toUpperCase())).map(p => p.marca).filter(m => m))];
          setAvailableBrands(brands);
          if(brands.length > 0) setRegCompany(brands[0]);
      }
      
      // 2. CARICA CONFIGURAZIONI (PROMPT AI)
      const { data: configData } = await supabase.from('configurazioni').select('valore').eq('chiave', 'system_prompt_agronomo').single();
      if(configData) {
          setActiveSystemPrompt(configData.valore);
      }

      const savedSize = await AsyncStorage.getItem('LAWN_SIZE');
      if(savedSize) setLawnSize(savedSize);
  };

  useEffect(() => { if (activePartners.length > 0) refreshAllAlerts(); else setClientAlerts([]); }, [activePartners]);

  const refreshAllAlerts = async () => {
      const emails = activePartners.map(p => p.email);
      if(emails.length === 0) return;
      const { data } = await supabase.from('alerts').select('*').in('agent_email', emails).order('created_at', {ascending: false});
      if(data && data.length > 0) setClientAlerts(data);
  };

  const initAppCliente = async () => {
    try { const favs = await AsyncStorage.getItem('FAVS'); if(favs) setFavorites(JSON.parse(favs)); } catch (e) {} finally { setAppIsReady(true); }
  };

  const initAppAgente = async (currentSession) => {
     if(!currentSession?.user?.email) return;
     const { data: agentData, error } = await supabase.from('agenti').select('*').eq('email', currentSession.user.email).single();
     if (error || !agentData || agentData.approvato === false) { setIsPendingApproval(true); setUserRole(null); } 
     else { setIsPendingApproval(false); setUserRole('AGENTE'); setAgentProfileId(agentData.id); fetchAgentCodes(agentData.id); fetchAgentAlerts(currentSession.user.email); }
     setShowAuthModal(false); setAppIsReady(true);
  };

  const checkApprovalStatus = async () => {
      setLoadingAuth(true);
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      setSession(freshSession); await initAppAgente(freshSession); setLoadingAuth(false);
      if(isPendingApproval) Alert.alert("In attesa", "Account non ancora attivo."); else Alert.alert("Attivo!", "Benvenuto.");
  };

  const handleAuth = async () => {
    setLoadingAuth(true);
    let error = null;
    if (isRegistering) {
        if(!regName || !regCompany) { Alert.alert("Dati mancanti", "Inserisci tutti i campi."); setLoadingAuth(false); return; }
        const res = await supabase.auth.signUp({ email, password, options: { data: { full_name: regName, company: regCompany } } });
        error = res.error;
        if (!error && res.data.user) {
            const { error: dbError } = await supabase.from('agenti').insert({ nome_agente: regName, email: email, azienda: regCompany, approvato: false });
            if (dbError) Alert.alert("Errore DB", dbError.message);
            else { Alert.alert("Richiesta Inviata", "In attesa di approvazione."); setIsRegistering(false); setIsPendingApproval(true); }
        }
    } else { const res = await supabase.auth.signInWithPassword({ email, password }); error = res.error; }
    if (error) Alert.alert("Errore", error.message); setLoadingAuth(false);
  };

  const handleLogout = async () => { setUserRole(null); setSession(null); setAgentCodes([]); setSentAlerts([]); setIsPendingApproval(false); await supabase.auth.signOut(); };

  // --- ALTRI COMPONENTI ---
  const fetchAgentCodes = async (profileId) => { if(!profileId) return; const { data } = await supabase.from('listini').select('*').eq('agente_id', profileId).order('created_at', { ascending: false }); if(data) setAgentCodes(data); };
  const fetchAgentAlerts = async (email) => { if(!email) return; const { data } = await supabase.from('alerts').select('*').eq('agent_email', email).order('created_at', { ascending: false }); if(data) setSentAlerts(data); };
  const saveOrUpdateCode = async () => {
     if(!agentProfileId || !newCodeData.codice_sconto) return Alert.alert("Errore", "Dati mancanti");
     const payload = { agente_id: agentProfileId, codice_sconto: newCodeData.codice_sconto.toUpperCase(), descrizione_interna: newCodeData.descrizione_interna, s_sementi: newCodeData.s_sementi, s_granulari: newCodeData.s_granulari, s_liquidi: newCodeData.s_liquidi };
     let error;
     if (editingId) { const res = await supabase.from('listini').update(payload).eq('id', editingId); error = res.error; } 
     else { const res = await supabase.from('listini').insert(payload); error = res.error; }
     if(error) Alert.alert("Errore", error.message); else { Alert.alert("Salvato", "Listino OK!"); setEditingId(null); setNewCodeData({ descrizione_interna: '', codice_sconto: '', s_sementi: '', s_granulari: '', s_liquidi: '' }); fetchAgentCodes(agentProfileId); }
  };
  const deleteCode = async (id) => { await supabase.from('listini').delete().eq('id', id); fetchAgentCodes(agentProfileId); };
  const startEditing = (item) => { setEditingId(item.id); setNewCodeData({ codice_sconto: item.codice_sconto, descrizione_interna: item.descrizione_interna, s_sementi: item.s_sementi || '', s_granulari: item.s_granulari || '', s_liquidi: item.s_liquidi || '' }); };
  const toggleAlertProduct = (product) => { const exists = alertProducts.find(p => p.id === product.id); if (exists) setAlertProducts(alertProducts.filter(p => p.id !== product.id)); else setAlertProducts([...alertProducts, product]); };
  const sendAlert = async () => {
      if(!alertMessage) return Alert.alert("Errore", "Messaggio vuoto");
      const userEmail = session?.user?.email; if(!userEmail) return;
      const { error } = await supabase.from('alerts').insert({ agent_email: userEmail, company: session?.user?.user_metadata?.company, message: alertMessage, product_name: alertProducts.map(p => p.nome).join(', ') || null });
      if(error) Alert.alert("Errore", error.message); else { Alert.alert("Inviato!", "Clienti avvisati."); setAlertMessage(''); setAlertProducts([]); fetchAgentAlerts(userEmail); }
  };
  const deleteAlert = async (id) => { await supabase.from('alerts').delete().eq('id', id); fetchAgentAlerts(session?.user?.email); };

  const validaCodice = async () => {
     if(!inputCodicePartner) return;
     const code = inputCodicePartner.toUpperCase().trim();
     if(activePartners.some(p => p.codice_sconto === code)) { Alert.alert("Già attivo", "Codice già in uso."); setInputCodicePartner(''); return; }
     const { data, error } = await supabase.from('listini').select(`*, agenti ( nome_agente, azienda, email, approvato )`).eq('codice_sconto', code).single();
     if(error || !data || !data.agenti?.approvato) { Alert.alert("Errore", "Codice non valido."); return; }
     const partnerData = { id: data.id, codice_sconto: data.codice_sconto, s_sementi: data.s_sementi, s_granulari: data.s_granulari, s_liquidi: data.s_liquidi, nome_agente: data.agenti.nome_agente, azienda: data.agenti.azienda, email: data.agenti.email };
     setActivePartners([...activePartners.filter(p => p.azienda !== partnerData.azienda), partnerData]); 
     trackEvent('ATTIVAZIONE_SCONTO', `Partner: ${partnerData.azienda}, Codice: ${code}`); 
     Alert.alert("Attivato", `Sconti ${partnerData.azienda} OK.`); 
     setInputCodicePartner('');
     setSelectedBrand('TUTTI'); 
  };
  const removePartner = (codice) => { setActivePartners(activePartners.filter(p => p.codice_sconto !== codice)); };
  const getDiscount = (p) => { const partner = activePartners.find(ap => (ap.azienda||'').toUpperCase() === (p.marca||'').toUpperCase()); if (!partner) return '0'; const c = (p.categoria||'').toUpperCase(); return (c.includes('SEMENTI')) ? partner.s_sementi : (c.includes('LIQUID')||c.includes('BIO')||c.includes('BAGNANT') ? partner.s_liquidi : partner.s_granulari); };
  const applyDisc = (price, discStr) => { if(!discStr || discStr==='0') return price; let final = price; discStr.split('+').forEach(d => { const val = parseFloat(d); if(!isNaN(val) && val > 0) final = final - (final * (val/100)); }); return final; };

  // --- CALCOLO COSTI E DOSI AGGIORNATO ---
  const calcSpecs = (p, mq) => { 
      const size = parseFloat(mq) || 0; 
      const price = parseFloat(p.prezzo) || 0; 
      const finalPriceUnit = applyDisc(price, getDiscount(p)); 
      
      const isLiquid = ['ML','L','LT'].includes((p.unita_misura||'').toUpperCase()); 
      
      const qRadRaw = (parseFloat(p.dose_radicale||0) * size);
      const qFogRaw = (parseFloat(p.dose_fogliare||0) * size);
      
      const qRadDisplay = isLiquid ? qRadRaw : (qRadRaw / 1000);
      const qFogDisplay = isLiquid ? qFogRaw : (qFogRaw / 1000);
      
      const unitDisplay = isLiquid ? 'ml' : 'Kg';

      // Calcolo COSTO in base alla dose totale e al prezzo unitario (Kg o L)
      const costRad = (qRadRaw / 1000) * finalPriceUnit; 
      const costFog = (qFogRaw / 1000) * finalPriceUnit;

      return { qRad: qRadDisplay, qFog: qFogDisplay, unit: unitDisplay, costRad, costFog }; 
  };

  const updateCartQuantity = (id, txt) => { setCartItems(cartItems.map(p => p.id === id ? {...p, quantity: txt} : p)); };
  const calculateCartTotal = () => { return cartItems.reduce((acc, p) => { const q = parseFloat(p.quantity) || 0; const price = applyDisc(parseFloat(p.prezzo)||0, getDiscount(p)); return acc + (q * price); }, 0); };
  const toggleFavorite = async (id) => { let newFavs = favorites.includes(id) ? favorites.filter(fid => fid !== id) : [...favorites, id]; setFavorites(newFavs); await AsyncStorage.setItem('FAVS', JSON.stringify(newFavs)); };
  const toggleMix = (product) => { const exists = mixItems.find(x => x.id === product.id); if (exists) setMixItems(mixItems.filter(x => x.id !== product.id)); else { setMixItems([...mixItems, product]); } };
  const toggleCart = (product) => { const exists = cartItems.find(p => p.id === product.id); if (exists) setCartItems(cartItems.filter(p => p.id !== product.id)); else setCartItems([...cartItems, { ...product, quantity: '' }]); };
  const updateLawnSize = (t) => { 
      setLawnSize(t); 
      AsyncStorage.setItem('LAWN_SIZE', t); 
      supabase.from('profili_anonimi').update({ ultimo_mq_usato: parseFloat(t)||0 }).eq('device_id', deviceId).then();
  };

  const printPDF = async () => { 
      let total = 0; 
      const rows = cartItems.map(p => { 
          const q = parseFloat(p.quantity) || 0; 
          const price = applyDisc(parseFloat(p.prezzo)||0, getDiscount(p)); 
          const cost = q * price; 
          total += cost; 
          const displayUnit = getDisplayUnit(p.unita_misura); // FIX: Usa unità pulita (L/Kg)
          return `<tr>
          <td style="padding:5px;border-bottom:1px solid #ddd"><b>${p.nome}</b><br/><span style="font-size:10px;color:#666">${p.marca}</span></td>
          <td style="padding:5px;border-bottom:1px solid #ddd;text-align:center;">${p.quantity || '0'} <span style="font-size:10px">${displayUnit}</span></td>
          <td style="padding:5px;border-bottom:1px solid #ddd;text-align:right;">€ ${cost.toFixed(2)}</td>
          </tr>`; 
      }).join(''); 
      
      const html = `<html><body style="font-family:Helvetica;padding:40px;">
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #00C853;padding-bottom:10px;">
        <div><h1 style="color:#1B5E20;margin:0;font-size:24px;">Preventivo</h1><p style="margin:0;color:#666;font-size:12px;">AgriManager powered by Sinelica</p></div>
        <div style="text-align:right;"><p>Data: ${new Date().toLocaleDateString()}</p><h3 style="margin:0;">${customerName}</h3><p style="margin:0;font-size:10px;color:#666;">Listini attivi: ${activePartners.length}</p></div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-top:20px;">
        <tr style="background:#f5f5f5;color:#333"><th style="text-align:left;padding:5px">PRODOTTO</th><th style="text-align:center;">Q.TÀ</th><th style="text-align:right;">PREZZO</th></tr>${rows}
      </table>
      <div style="margin-top:20px;text-align:right;"><p style="font-size:14px;color:#666;">TOTALE PREVENTIVO</p><h2 style="color:#00C853;margin:0;">€ ${total.toFixed(2)}</h2></div>
      </body></html>`; 
      
      try { const { uri } = await Print.printToFileAsync({ html }); await Sharing.shareAsync(uri); trackEvent('STAMPA_PDF', `Articoli: ${cartItems.length}, Tot: ${total}`); } catch(e){} 
  };

  if(!appIsReady) return <View style={styles.center}><ActivityIndicator size="large" color={THEME.accent}/></View>;

  if(!userRole && !isPendingApproval) return (
    <View style={styles.center}>
       <View style={{marginBottom:40}}><BrandLogo scale={1.5}/></View>
       
       <Modal visible={showWelcomeModal} animationType="slide" transparent>
            <View style={styles.modalOverlay}>
                <View style={styles.modalCard}>
                    <Ionicons name="leaf-outline" size={50} color={THEME.accent} />
                    <Text style={{fontSize:22, fontWeight:'bold', color:THEME.textDark, marginTop:10, marginBottom:5}}>Benvenuto in AgriManager!</Text>
                    <Text style={{textAlign:'center', color:'#666', marginBottom:20}}>Per aiutarti al meglio con le dosi e il meteo, dicci chi sei.</Text>
                    
                    <View style={{flexDirection:'row', gap:10, marginBottom:15, width:'100%'}}>
                        <TouchableOpacity onPress={()=>setWelcomeData({...welcomeData, tipo: 'HOBBISTA'})} style={{flex:1, padding:15, borderRadius:10, borderWidth:2, borderColor: welcomeData.tipo==='HOBBISTA'?THEME.accent:'#eee', backgroundColor: welcomeData.tipo==='HOBBISTA'?'#E8F5E9':'#fff', alignItems:'center'}}>
                            <Ionicons name="home-outline" size={24} color={welcomeData.tipo==='HOBBISTA'?THEME.accent:'#999'}/>
                            <Text style={{fontWeight:'bold', marginTop:5, color:welcomeData.tipo==='HOBBISTA'?THEME.textDark:'#999'}}>HOBBISTA</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={()=>setWelcomeData({...welcomeData, tipo: 'GIARDINIERE'})} style={{flex:1, padding:15, borderRadius:10, borderWidth:2, borderColor: welcomeData.tipo==='GIARDINIERE'?THEME.primary:'#eee', backgroundColor: welcomeData.tipo==='GIARDINIERE'?'#E8EAF6':'#fff', alignItems:'center'}}>
                            <Ionicons name="construct-outline" size={24} color={welcomeData.tipo==='GIARDINIERE'?THEME.primary:'#999'}/>
                            <Text style={{fontWeight:'bold', marginTop:5, color:welcomeData.tipo==='GIARDINIERE'?THEME.primary:'#999'}}>GIARDINIERE</Text>
                        </TouchableOpacity>
                    </View>

                    <TextInput style={[styles.inputContainer, {backgroundColor:'#fff'}]} placeholder="La tua Città o CAP (es. Milano)" value={welcomeData.citta} onChangeText={t=>setWelcomeData({...welcomeData, citta:t})}/>
                    
                    {welcomeData.tipo === 'HOBBISTA' && (
                        <TextInput style={[styles.inputContainer, {backgroundColor:'#fff'}]} placeholder="Grandezza Prato (MQ)" keyboardType="numeric" value={welcomeData.mq} onChangeText={t=>setWelcomeData({...welcomeData, mq:t})}/>
                    )}

                    <TouchableOpacity style={[styles.btnBig, {marginTop:10}]} onPress={saveWelcomeData}>
                        <Text style={styles.btnText}>INIZIA ORA</Text>
                    </TouchableOpacity>
                </View>
            </View>
       </Modal>

       <TouchableOpacity style={styles.btnBig} onPress={handleEnterShop}>
           <Text style={styles.btnText}>ENTRA NELLO SHOP</Text>
           <Ionicons name="cart-outline" size={24} color="#fff" style={{marginLeft:10}}/>
       </TouchableOpacity>

       <TouchableOpacity style={[styles.btnOutline,{marginTop:20}]} onPress={()=>{setShowAuthModal(true); setIsRegistering(false);}}><Text style={{color:THEME.textDark, fontWeight:'bold'}}>ACCESSO AGENTI</Text><Ionicons name="briefcase-outline" size={20} color={THEME.textDark} style={{marginLeft:10}}/></TouchableOpacity>
       
       <Modal visible={showAuthModal} transparent animationType="fade" onRequestClose={()=>setShowAuthModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
             <View style={styles.modalCard}>
                <View style={{alignItems:'center', marginBottom:20}}><BrandLogo scale={0.8}/><Text style={{fontSize:18, fontWeight:'bold', color:THEME.primary, marginTop:10}}>{isRegistering ? 'Nuovo Profilo Agente' : 'Login Portale Agenti'}</Text></View>
                {isRegistering && (<>
                        <View style={styles.inputContainer}><Ionicons name="person-outline" size={20} color="#999" style={{marginRight:10}}/><TextInput style={{flex:1, fontSize:16}} placeholder="Nome e Cognome" value={regName} onChangeText={setRegName}/></View>
                        <TouchableOpacity style={styles.inputContainer} onPress={()=>setShowRegDropdown(!showRegDropdown)}><Ionicons name="business-outline" size={20} color="#999" style={{marginRight:10}}/><Text style={{flex:1, fontSize:16, color: regCompany ? '#000':'#999'}}>{regCompany || "Azienda di Riferimento"}</Text><Ionicons name="chevron-down" size={20} color="#999"/></TouchableOpacity>
                        {showRegDropdown && (<View style={styles.dropContainer}><ScrollView keyboardShouldPersistTaps="handled">{availableBrands.map(c => (<TouchableOpacity key={c} style={styles.dropItem} onPress={()=>{setRegCompany(c); setShowRegDropdown(false)}}><Text>{c}</Text></TouchableOpacity>))}</ScrollView></View>)}
                </>)}
                <View style={styles.inputContainer}><Ionicons name="mail-outline" size={20} color="#999" style={{marginRight:10}}/><TextInput style={{flex:1, fontSize:16}} placeholder="Email Aziendale" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail}/></View>
                <View style={styles.inputContainer}><Ionicons name="lock-closed-outline" size={20} color="#999" style={{marginRight:10}}/><TextInput style={{flex:1, fontSize:16}} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword}/></View>
                <TouchableOpacity style={[styles.btnBig, {marginTop:15}]} onPress={handleAuth} disabled={loadingAuth}>{loadingAuth ? <ActivityIndicator color="#fff"/> : <Text style={styles.btnText}>{isRegistering ? 'INVIA' : 'ACCEDI'}</Text>}</TouchableOpacity>
                <View style={{flexDirection:'row', marginTop:20, gap:5}}><Text style={{color:'#666'}}>{isRegistering ? "Hai già le credenziali?" : "Non sei ancora registrato?"}</Text><TouchableOpacity onPress={()=>setIsRegistering(!isRegistering)}><Text style={{color:THEME.primary, fontWeight:'bold'}}>{isRegistering ? "Accedi" : "Crea Account"}</Text></TouchableOpacity></View>
                <TouchableOpacity onPress={()=>setShowAuthModal(false)} style={{marginTop:15}}><Text style={{color:THEME.danger, fontSize:14}}>Chiudi</Text></TouchableOpacity>
             </View>
          </KeyboardAvoidingView>
       </Modal>
    </View>
  );

  if(isPendingApproval) return (
      <View style={styles.center}><Ionicons name="shield-checkmark-outline" size={80} color={THEME.warning} /><Text style={{fontSize:22, fontWeight:'bold', marginTop:20, color:THEME.textDark}}>REGISTRAZIONE RICEVUTA</Text><Text style={{textAlign:'center', marginTop:10, paddingHorizontal:40, color:'#666', lineHeight:22}}>Il tuo account è stato creato. Attendi l'attivazione da parte dell'amministrazione.</Text><TouchableOpacity style={[styles.btnBig, {marginTop:40, width:250}]} onPress={checkApprovalStatus} disabled={loadingAuth}>{loadingAuth ? <ActivityIndicator color="#fff"/> : <Text style={styles.btnText}>VERIFICA ORA</Text>}</TouchableOpacity><TouchableOpacity style={[styles.btnOutline, {marginTop:15, width:250}]} onPress={handleLogout}><Text style={{color:THEME.textDark, fontWeight:'bold'}}>ESCI</Text></TouchableOpacity></View>
  );

  if(userRole === 'AGENTE' && session) return (
    <SafeAreaView style={{flex:1, backgroundColor:THEME.bg}}>
       <View style={styles.header}><View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}><BrandLogo/><TouchableOpacity onPress={handleLogout}><Ionicons name="log-out-outline" size={24} color={THEME.danger}/></TouchableOpacity></View><Text style={{textAlign:'center', marginTop:5, color:'#666', fontSize:10}}>{session?.user?.user_metadata?.full_name?.toUpperCase()}</Text><View style={{flexDirection:'row', marginTop:15, backgroundColor:'#eee', borderRadius:10, padding:2}}><TouchableOpacity onPress={()=>setAgentTab('CODES')} style={[styles.tab, agentTab==='CODES' && styles.activeTab]}><Text style={[styles.tabText, agentTab==='CODES' && styles.activeTabText]}>SCONTI</Text></TouchableOpacity><TouchableOpacity onPress={()=>setAgentTab('ALERTS')} style={[styles.tab, agentTab==='ALERTS' && styles.activeTab]}><Text style={[styles.tabText, agentTab==='ALERTS' && styles.activeTabText]}>AVVISI</Text></TouchableOpacity></View></View>
       <ScrollView contentContainerStyle={{padding:15}}>
           {agentTab === 'CODES' && (<><View style={[styles.cardForm, editingId && {borderWidth:2, borderColor:THEME.warning}]}><Text style={styles.sectionTitle}>{editingId ? "MODIFICA CODICE" : "NUOVO CODICE"}</Text><TextInput style={[styles.inputSmall, {borderColor:THEME.accent, color:THEME.accent, fontWeight:'bold', marginBottom:10}]} value={newCodeData.codice_sconto} onChangeText={t=>setNewCodeData({...newCodeData, codice_sconto:t})} autoCapitalize="characters" placeholder="CODICE (es: ROSSI2026)"/><TextInput style={[styles.inputSmall, {marginBottom:10}]} value={newCodeData.descrizione_interna} onChangeText={t=>setNewCodeData({...newCodeData, descrizione_interna:t})} placeholder="Descrizione (es. Cliente VIP)"/><View style={{flexDirection:'row', gap:5}}><TextInput style={[styles.inputDiscount, {flex:1}]} placeholder="Sem%" value={newCodeData.s_sementi} onChangeText={t=>setNewCodeData({...newCodeData, s_sementi:t})}/><TextInput style={[styles.inputDiscount, {flex:1}]} placeholder="Gran%" value={newCodeData.s_granulari} onChangeText={t=>setNewCodeData({...newCodeData, s_granulari:t})}/><TextInput style={[styles.inputDiscount, {flex:1}]} placeholder="Liq%" value={newCodeData.s_liquidi} onChangeText={t=>setNewCodeData({...newCodeData, s_liquidi:t})}/></View><TouchableOpacity style={[styles.btnBig, {marginTop:15, backgroundColor: editingId ? THEME.warning : THEME.textDark}]} onPress={saveOrUpdateCode}><Text style={styles.btnText}>{editingId ? "AGGIORNA" : "SALVA"}</Text></TouchableOpacity>{editingId && <TouchableOpacity onPress={()=>{setEditingId(null); setNewCodeData({ descrizione_interna: '', codice_sconto: '', s_sementi: '', s_granulari: '', s_liquidi: '' })}} style={{alignSelf:'center', marginTop:10}}><Text style={{color:'red'}}>Annulla</Text></TouchableOpacity>}</View><Text style={[styles.sectionTitle, {marginTop:20, marginLeft:5}]}>LISTA CODICI</Text><View style={styles.table}><View style={[styles.tableRow, {backgroundColor:THEME.tableHeader}]}><Text style={[styles.col, {flex:2, fontWeight:'bold'}]}>CODICE</Text><Text style={[styles.col, {flex:2, fontWeight:'bold'}]}>NOTE</Text><Text style={[styles.col, {flex:1, textAlign:'center'}]}>AZIONI</Text></View>{agentCodes.map((item, idx) => (<View key={idx} style={styles.tableRow}><TouchableOpacity style={{flex:2, padding:8}} onPress={()=>showCodeDetails(item)}><Text style={{color:THEME.accent, fontWeight:'bold', textDecorationLine:'underline'}}>{item.codice_sconto}</Text></TouchableOpacity><Text style={[styles.col, {flex:2, fontSize:11}]}>{item.descrizione_interna}</Text><View style={{flex:1, flexDirection:'row', justifyContent:'center'}}><TouchableOpacity onPress={()=>startEditing(item)} style={{marginRight:8}}><Ionicons name="pencil" size={18} color={THEME.warning}/></TouchableOpacity><TouchableOpacity onPress={()=>deleteCode(item.id)}><Ionicons name="trash" size={18} color={THEME.danger}/></TouchableOpacity></View></View>))}</View></>)}
           {agentTab === 'ALERTS' && (<><View style={styles.cardForm}><Text style={[styles.sectionTitle, {color:THEME.danger}]}>INVIA ALERT TECNICO</Text><TextInput style={[styles.inputSmall, {height:80, textAlignVertical:'top'}]} multiline placeholder="Scrivi il messaggio dettagliato per i clienti..." value={alertMessage} onChangeText={setAlertMessage}/><TouchableOpacity style={[styles.inputSmall, {marginTop:10, flexDirection:'row', justifyContent:'space-between'}]} onPress={()=>setShowProductPicker(true)}><Text style={{color: alertProducts.length>0 ? THEME.primary : '#999', fontWeight: alertProducts.length>0?'bold':'normal'}}>{alertProducts.length > 0 ? `${alertProducts.length} Prodotti Selezionati` : "Seleziona Prodotti Consigliati (Opz)"}</Text><Ionicons name="list" size={20} color="#666"/></TouchableOpacity><TouchableOpacity style={[styles.btnBig, {marginTop:15, backgroundColor:THEME.danger}]} onPress={sendAlert}><Ionicons name="megaphone-outline" size={20} color="#fff" style={{marginRight:5}}/><Text style={styles.btnText}>INVIA AI CLIENTI</Text></TouchableOpacity></View><Text style={[styles.sectionTitle, {marginTop:20, marginLeft:5}]}>STORICO AVVISI</Text>{sentAlerts.map((alert, idx) => (<View key={idx} style={{backgroundColor:'#fff', padding:15, borderRadius:10, marginBottom:10, borderLeftWidth:4, borderColor:THEME.danger, flexDirection:'row', justifyContent:'space-between'}}><View style={{flex:1}}><Text numberOfLines={2} style={{fontWeight:'bold', color:THEME.danger}}>{alert.message}</Text><Text style={{fontSize:10, color:'#999', marginTop:5}}>{new Date(alert.created_at).toLocaleDateString()}</Text></View><TouchableOpacity onPress={()=>deleteAlert(alert.id)}><Ionicons name="trash" size={20} color="#999"/></TouchableOpacity></View>))}<Modal visible={showProductPicker} animationType="slide"><SafeAreaView style={{flex:1}}><View style={{padding:20, borderBottomWidth:1, borderColor:'#eee', flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}><Text style={{fontWeight:'bold', fontSize:18}}>Seleziona Prodotti</Text><TouchableOpacity onPress={()=>setShowProductPicker(false)}><Text style={{color:THEME.primary, fontWeight:'bold'}}>FATTO</Text></TouchableOpacity></View><FlatList data={productsDB.filter(p => p.marca.toUpperCase() === session?.user?.user_metadata?.company.toUpperCase())} keyExtractor={i=>i.id.toString()} renderItem={({item}) => { const isSelected = alertProducts.some(p => p.id === item.id); return ( <TouchableOpacity style={{padding:15, borderBottomWidth:1, borderColor:'#eee', backgroundColor: isSelected ? '#E8F5E9' : '#fff', flexDirection:'row', justifyContent:'space-between', alignItems:'center'}} onPress={()=>toggleAlertProduct(item)}><View><Text style={{fontWeight:'bold'}}>{item.nome}</Text><Text style={{fontSize:12, color:'#666'}}>{item.categoria}</Text></View>{isSelected && <Ionicons name="checkmark-circle" size={24} color={THEME.accent}/>}</TouchableOpacity> );}}/></SafeAreaView></Modal></>)}
       </ScrollView>
    </SafeAreaView>
  );

  // --- UI: SHOP CLIENTI ---
  return (
    <SafeAreaView style={{flex:1, backgroundColor:THEME.bg, paddingTop: Platform.OS==='android'?StatusBar.currentHeight:0}}>
      <StatusBar barStyle="dark-content"/>
      {clientAlerts.length > 0 && (<TouchableOpacity activeOpacity={0.9} onPress={()=>setSelectedAlert(clientAlerts[0])} style={{backgroundColor:THEME.danger, padding:12, marginBottom:1, flexDirection:'row', alignItems:'center', justifyContent:'center'}}><Ionicons name="warning" size={24} color="#fff" style={{marginRight:10}}/><View style={{flex:1}}><Text style={{color:'#fff', fontWeight:'bold', fontSize:11, textTransform:'uppercase'}}>AVVISO {clientAlerts[0].company}</Text><Text numberOfLines={2} style={{color:'#fff', fontSize:13}}>{clientAlerts[0].message}</Text><Text style={{color:'#FFF', fontSize:10, marginTop:4, textDecorationLine:'underline', fontWeight:'bold'}}>LEGGI AVVISO COMPLETO ➔</Text></View></TouchableOpacity>)}
      <Modal visible={selectedAlert !== null} animationType="fade" transparent><View style={styles.modalOverlay}><View style={styles.modalCard}><View style={{alignItems:'center', marginBottom:15}}><Ionicons name="megaphone" size={40} color={THEME.danger} /><Text style={{fontSize:18, fontWeight:'900', color:THEME.danger, marginTop:10}}>AVVISO TECNICO</Text><Text style={{fontSize:12, color:'#666'}}>{selectedAlert?.company} - {new Date(selectedAlert?.created_at).toLocaleDateString()}</Text></View><ScrollView style={{maxHeight: 300, width:'100%', marginBottom:20}}><Text style={{fontSize:16, lineHeight:24, color:'#333', textAlign:'justify'}}>{selectedAlert?.message}</Text>{selectedAlert?.product_name && (<View style={{marginTop:20, backgroundColor:'#FBE9E7', padding:10, borderRadius:8}}><Text style={{fontWeight:'bold', color:THEME.danger, fontSize:12}}>PRODOTTI CONSIGLIATI:</Text><Text style={{color:THEME.textDark, fontWeight:'bold'}}>{selectedAlert.product_name}</Text></View>)}</ScrollView><View style={{width:'100%', gap:10}}><TouchableOpacity style={[styles.btnBig, {backgroundColor:THEME.primary}]} onPress={handleDismissAlert}><Text style={styles.btnText}>HO CAPITO (ARCHIVIA)</Text></TouchableOpacity><TouchableOpacity style={[styles.btnOutline, {borderColor:'#999'}]} onPress={handlePostponeAlert}><Text style={{color:'#666', fontWeight:'bold'}}>RICORDAMELO DOPO</Text></TouchableOpacity></View></View></View></Modal>

      <View style={styles.header}>
         <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
             <TouchableOpacity onPress={()=>setUserRole(null)}><Ionicons name="arrow-back" size={24} color={THEME.textDark}/></TouchableOpacity>
             <BrandLogo/>
             <View style={{flexDirection:'row', alignItems:'center', gap:15}}>
                 <TouchableOpacity onPress={()=>setShowSettingsModal(true)}>
                     <Ionicons name="settings-outline" size={22} color={THEME.textDark}/>
                 </TouchableOpacity>
                 <TouchableOpacity onPress={()=>setShowFavModal(true)} style={{position:'relative'}}>
                     <Ionicons name="heart" size={26} color={THEME.danger}/>
                     {favorites.length > 0 && <View style={{position:'absolute', top:-2, right:-2, backgroundColor:THEME.accent, borderRadius:10, width:14, height:14, alignItems:'center', justifyContent:'center'}}><Text style={{color:'#fff', fontSize:9, fontWeight:'bold'}}>{favorites.length}</Text></View>}
                 </TouchableOpacity>
             </View>
         </View>
         
         {/* --- METEO COMPATTO --- */}
         <View style={styles.weatherCard}>
             {weatherData ? (
                 <View style={{flexDirection:'row', alignItems:'center', justifyContent:'space-between'}}>
                     <View style={{flexDirection:'row', alignItems:'center'}}>
                         {weatherData.weather[0].main === 'Rain' ? <Ionicons name="rainy" size={24} color="#4FC3F7"/> :
                          weatherData.weather[0].main === 'Clouds' ? <Ionicons name="cloud" size={24} color="#B0BEC5"/> :
                          <Ionicons name="sunny" size={24} color="#FFB300"/>}
                         <View style={{marginLeft:10}}>
                             <Text style={{fontWeight:'bold', color:THEME.textDark, fontSize:10}}>METEO {weatherData.name.toUpperCase()}</Text>
                             <Text style={{fontSize:16, fontWeight:'900', color:'#333'}}>{Math.round(weatherData.main.temp)}°C</Text>
                         </View>
                     </View>
                     <View style={{alignItems:'flex-end'}}>
                         {(() => {
                             const advice = getAgronomicAdvice(weatherData);
                             return (
                                 <>
                                     <Text style={{color: advice.color, fontWeight:'bold', fontSize:10}}>{advice.status}</Text>
                                     <Text style={{fontSize:9, color:'#666', marginTop:0, maxWidth:120, textAlign:'right'}}>{advice.advice}</Text>
                                 </>
                             );
                         })()}
                     </View>
                 </View>
             ) : (
                 <Text style={{textAlign:'center', color:'#999', fontSize:10}}>Caricamento meteo...</Text>
             )}
         </View>

         <View style={[styles.searchBox, {marginBottom: 5, height:40}]}>
            <Ionicons name="key" size={18} color="#999"/>
            <TextInput style={[styles.searchInput, {fontSize:14}]} placeholder="Aggiungi Codice Listino..." value={inputCodicePartner} onChangeText={setInputCodicePartner}/>
            <TouchableOpacity onPress={validaCodice}><Ionicons name="add-circle" size={26} color={THEME.accent}/></TouchableOpacity>
         </View>
         
         {activePartners.length > 0 && (<ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:5, maxHeight:35}}>{activePartners.map((partner, idx) => (<TouchableOpacity key={idx} onPress={()=>removePartner(partner.codice_sconto)} style={{flexDirection:'row', alignItems:'center', backgroundColor:THEME.primary, paddingHorizontal:8, paddingVertical:4, borderRadius:20, marginRight:8}}><Text style={{color:'#fff', fontSize:10, fontWeight:'bold'}}>{partner.azienda} - {partner.nome_agente}</Text><Ionicons name="close-circle" size={14} color="#fff" style={{marginLeft:5}}/></TouchableOpacity>))}</ScrollView>)}
         
         <View style={[styles.searchBox, {height:40}]}>
             <Ionicons name="search" size={18} color="#666"/>
             <TextInput style={[styles.searchInput, {fontSize:14}]} placeholder="Cerca prodotto..." value={search} onChangeText={(t) => { setSearch(t); if(t.length > 3) trackEvent('RICERCA', t); }}/>
         </View>
         
         <View style={{marginTop:10}}><ScrollView horizontal showsHorizontalScrollIndicator={false}>{activePartners.length > 0 ? [...new Set(activePartners.map(p => p.azienda))].map(b => (<TouchableOpacity key={b} onPress={()=>setSelectedBrand(b?b.toUpperCase():'TUTTI')} style={[styles.chip, selectedBrand===(b?b.toUpperCase():'TUTTI') && {backgroundColor:THEME.textDark}]}><Text style={[styles.chipText, selectedBrand===(b?b.toUpperCase():'TUTTI') && {color:'#fff'}]}>{b}</Text></TouchableOpacity>)) : ['TUTTI', ...new Set(productsDB.map(i=>i.marca).filter(x=>x))].map(b => (<TouchableOpacity key={b} onPress={()=>setSelectedBrand(b?b.toUpperCase():'TUTTI')} style={[styles.chip, selectedBrand===(b?b.toUpperCase():'TUTTI') && {backgroundColor:THEME.textDark}]}><Text style={[styles.chipText, selectedBrand===(b?b.toUpperCase():'TUTTI') && {color:'#fff'}]}>{b}</Text></TouchableOpacity>))}{activePartners.length > 1 && (<TouchableOpacity onPress={()=>setSelectedBrand('TUTTI')} style={[styles.chip, selectedBrand==='TUTTI' && {backgroundColor:THEME.textDark}]}><Text style={[styles.chipText, selectedBrand==='TUTTI' && {color:'#fff'}]}>TUTTI I MIEI LISTINI</Text></TouchableOpacity>)}</ScrollView></View>
         <View style={{marginTop:5}}><ScrollView horizontal showsHorizontalScrollIndicator={false}>{['TUTTI', ...new Set(productsDB.map(i=>i.categoria).filter(c => c && !isPharmacyCategory(c)))].map(c => (<TouchableOpacity key={c} onPress={()=>setSelectedCategory(c?c.toUpperCase():'TUTTI')} style={[styles.chipSmall, selectedCategory===(c?c.toUpperCase():'TUTTI') && {backgroundColor:THEME.accent, borderColor:THEME.accent}]}><Text style={[styles.chipTextSmall, selectedCategory===(c?c.toUpperCase():'TUTTI') && {color:'#fff'}]}>{c}</Text></TouchableOpacity>))}</ScrollView></View>
      </View>
      <FlatList 
         data={productsDB
             .filter(p => {
                 const allowedBrands = activePartners.map(ap => ap.azienda.toUpperCase());
                 // ESCLUDI SEMPRE FARMACIA DALLA LISTA PRINCIPALE (A MENO CHE NON CERCATA ESPLICITAMENTE)
                 if (isPharmacyCategory(p.categoria) && !search && selectedCategory !== 'SOS FARMACIA') return false;

                 if (allowedBrands.length > 0 && !allowedBrands.includes(p.marca.toUpperCase())) return false;
                 if (search && getSearchScore(p, search).count === 0) return false;
                 if (selectedBrand !== 'TUTTI' && p.marca.toUpperCase() !== selectedBrand.toUpperCase()) return false;
                 if (selectedCategory !== 'TUTTI' && p.categoria.toUpperCase() !== selectedCategory) return false;
                 return true;
             })
             .sort((a, b) => {
                 if (!search) return 0;
                 const scoreA = getSearchScore(a, search);
                 const scoreB = getSearchScore(b, search);
                 if (scoreA.qty !== scoreB.qty) return scoreB.qty - scoreA.qty;
                 return scoreB.count - scoreA.count;
             })
         }
         keyExtractor={i => i.id.toString()}
         contentContainerStyle={{padding:15, paddingBottom:100}}
         renderItem={({item}) => {
             const isFav = favorites.includes(item.id);
             const inCart = cartItems.some(p=>p.id===item.id);
             const inMix = mixItems.some(p=>p.id===item.id);
             const hasAccess = activePartners.length > 0;
             const cardColor = getCategoryColor(item.categoria);
             const showBrand = shouldShowBrand(item.categoria);
             
             // CALCOLO PREZZO
             const price = parseFloat(item.prezzo) || 0;
             const discount = getDiscount(item);
             const finalPrice = applyDisc(price, discount);

             return (
               <View style={[styles.card, {borderColor: cardColor, borderWidth: 2}, (inCart || inMix) && {backgroundColor:'#f9f9f9'}]}>
                   <TouchableOpacity style={styles.cardLeft} onPress={()=>toggleFavorite(item.id)}><Ionicons name={isFav?"heart":"heart-outline"} size={26} color={isFav?THEME.danger:THEME.iconInactive}/></TouchableOpacity>
                   <TouchableOpacity style={styles.cardCenter} onPress={()=>{setSelectedProduct(item); trackEvent('VISUALIZZA_PRODOTTO', item.nome); }}>
                       {showBrand && <HighlightText baseStyle={styles.cardBrand} text={item.marca} term={search} />}
                       <HighlightText baseStyle={styles.cardTitle} text={item.nome} term={search} />
                       <HighlightText baseStyle={[styles.cardSub, {color: cardColor, fontWeight:'bold'}]} text={getCleanCategoryName(item.categoria)} term={search} />
                   </TouchableOpacity>
                   <View style={styles.cardRight}>
                       {hasAccess ? (
                           <>
                               <Text style={{fontWeight:'bold', color:THEME.accent, marginBottom:5}}>€ {finalPrice.toFixed(2)}</Text>
                               <TouchableOpacity onPress={() => toggleMix(item)} style={{marginBottom:10}}><View style={{backgroundColor:inMix?THEME.primary:'#fff', padding:6, borderRadius:8, borderWidth:1, borderColor:inMix?THEME.primary:THEME.secondary}}><Ionicons name={inMix?"flask":"flask-outline"} size={20} color={inMix?"#fff":THEME.iconInactive}/></View></TouchableOpacity>
                               <TouchableOpacity onPress={() => toggleCart(item)}><View style={{backgroundColor:inCart?THEME.accent:'#fff', padding:6, borderRadius:8, borderWidth:1, borderColor:inCart?THEME.accent:THEME.secondary}}><Ionicons name={inCart?"cart":"cart-outline"} size={20} color={inCart?"#fff":THEME.iconInactive}/></View></TouchableOpacity>
                           </>
                       ) : (
                           <View style={{alignItems:'center', justifyContent:'center'}}>
                               <Ionicons name="lock-closed" size={24} color={THEME.iconInactive}/>
                               <Text style={{fontSize:9, color:'#999', textAlign:'center', marginTop:2}}>LISTINO{'\n'}RISERVATO</Text>
                           </View>
                       )}
                   </View>
               </View>
             );
         }}
      />
      
      {/* --- FAB BUTTONS --- */}
      <View style={{position:'absolute', bottom:30, right:20, gap:15, alignItems:'flex-end'}}>
         {/* TASTO AI CAMERA */}
         <TouchableOpacity style={[styles.fab, {backgroundColor:THEME.ai, width:60, height:60, borderRadius:30, justifyContent:'center', paddingHorizontal:0}]} onPress={handlePhotoAction}>
             <Ionicons name="camera" size={30} color="#fff"/>
         </TouchableOpacity>

         <TouchableOpacity style={[styles.fab, {backgroundColor:THEME.danger}]} onPress={()=>{ setShowSOSModal(true); trackEvent('APERTURA_FARMACIA', 'SOS Button'); }}>
             <Ionicons name="medkit" size={24} color="#fff"/>
             <Text style={styles.fabText}>SOS</Text>
         </TouchableOpacity>

         {mixItems.length > 0 && (<TouchableOpacity style={[styles.fab, {backgroundColor:THEME.primary}]} onPress={()=>setShowMixListModal(true)}><Ionicons name="flask" size={24} color="#fff"/><Text style={styles.fabText}>MIX ({mixItems.length})</Text></TouchableOpacity>)}
         {cartItems.length > 0 && (<TouchableOpacity style={[styles.fab, {backgroundColor:THEME.accent}]} onPress={()=>setShowCartModal(true)}><Ionicons name="cart" size={24} color="#fff"/><Text style={styles.fabText}>ORDINE ({cartItems.length})</Text></TouchableOpacity>)}
      </View>

      {/* --- MODAL CONTESTO (TIME MACHINE) --- */}
      <Modal visible={showContextModal} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
              <View style={styles.modalCard}>
                  <Text style={{fontSize:20, fontWeight:'bold', color:THEME.textDark, marginBottom:10}}>Dettagli Foto 📸</Text>
                  {aiImage && <Image source={{uri: aiImage.uri}} style={{width:150, height:100, borderRadius:10, marginBottom:15}} />}
                  <Text style={{textAlign:'center', color:'#666', marginBottom:20, fontSize:12}}>Inserisci data e luogo per aiutare l'Agronomo Digitale a capire il clima.</Text>
                  
                  <View style={styles.inputContainer}>
                      <Ionicons name="calendar" size={20} color="#666" style={{marginRight:10}}/>
                      <TextInput style={{flex:1}} placeholder="YYYY-MM-DD" value={aiContextData.date} onChangeText={t=>setAiContextData({...aiContextData, date:t})}/>
                  </View>
                  <View style={styles.inputContainer}>
                      <Ionicons name="location" size={20} color="#666" style={{marginRight:10}}/>
                      <TextInput style={{flex:1}} placeholder="Città (es. Milano)" value={aiContextData.city} onChangeText={t=>setAiContextData({...aiContextData, city:t})}/>
                  </View>
                   <View style={styles.inputContainer}>
                      <Ionicons name="leaf" size={20} color="#666" style={{marginRight:10}}/>
                      <TextInput style={{flex:1}} placeholder="Tipo di Pianta (Opzionale)" value={aiContextData.plantType} onChangeText={t=>setAiContextData({...aiContextData, plantType:t})}/>
                  </View>

                  <TouchableOpacity style={[styles.btnBig, {marginTop:10}]} onPress={startAnalysis}>
                      <Text style={styles.btnText}>ANALIZZA ORA</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={()=>{setShowContextModal(false); setAiImage(null);}} style={{marginTop:15}}>
                      <Text style={{color:THEME.danger}}>Annulla</Text>
                  </TouchableOpacity>
              </View>
          </View>
      </Modal>

      {/* --- MODAL AI RESULT (COMPACT & SCROLLABLE) --- */}
      <Modal visible={showAIModal} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
              <View style={[styles.modalCard, {padding:20, width:'90%'}]}>
                  <View style={{alignItems:'center', marginBottom:10}}>
                      <Ionicons name="eye" size={32} color={THEME.ai} />
                      <Text style={{fontSize:18, fontWeight:'bold', color:THEME.ai, marginTop:5}}>DIAGNOSI AI</Text>
                  </View>
                  
                  {aiImage && <Image source={{uri: aiImage.uri}} style={{width:120, height:80, borderRadius:10, marginBottom:10}} />}

                  {aiAnalyzing ? (
                      <View style={{alignItems:'center', padding:20}}>
                          <ActivityIndicator size="large" color={THEME.ai} />
                          <Text style={{marginTop:15, color:'#666'}}>Sto analizzando...</Text>
                      </View>
                  ) : (
                      <>
                      <ScrollView style={{maxHeight: 120, width:'100%', marginBottom:10}}>
                          <Text style={{fontSize:14, lineHeight:20, color:'#333', textAlign:'justify'}}>{aiResult}</Text>
                      </ScrollView>

                      {/* SEZIONE PRODOTTI CONSIGLIATI */}
                      {aiRecommendedProducts.length > 0 && (
                          <View style={{width:'100%', borderTopWidth:1, borderColor:'#eee', paddingTop:10, marginBottom:10}}>
                              <Text style={{fontWeight:'bold', color:THEME.accent, marginBottom:5, fontSize:12}}>SOLUZIONI CONSIGLIATE:</Text>
                              {aiRecommendedProducts.map((p, i) => (
                                  <TouchableOpacity key={i} onPress={()=>{setSelectedProduct(p);}} style={{flexDirection:'row', alignItems:'center', padding:8, backgroundColor:'#f9f9f9', marginBottom:5, borderRadius:8, borderLeftWidth:4, borderColor:THEME.accent}}>
                                      <View style={{flex:1}}>
                                          {/* NUOVO: MOSTRA ANCHE LA CATEGORIA */}
                                          <Text style={{fontWeight:'bold', fontSize:11}}>
                                              {p.nome} <Text style={{fontWeight:'normal', color:'#666', fontSize:10}}>({p.categoria})</Text>
                                          </Text>
                                      </View>
                                      <Ionicons name="arrow-forward-circle" size={20} color={THEME.accent}/>
                                  </TouchableOpacity>
                              ))}
                          </View>
                      )}
                      
                      <TouchableOpacity onPress={()=>{setShowAIModal(false); setSosSearch('');}} style={{alignSelf:'center', marginTop:5}}>
                              <Text style={{color:'#666', fontSize:12}}>Chiudi</Text>
                      </TouchableOpacity>
                      </>
                  )}
              </View>
          </View>
      </Modal>
      
      {/* --- MODAL SOS FARMACIA --- */}
      <Modal visible={showSOSModal} animationType="slide">
          <SafeAreaView style={{flex:1, backgroundColor:'#fff'}}>
              <View style={{padding:20, backgroundColor:THEME.danger, flexDirection:'row', alignItems:'center', justifyContent:'space-between'}}>
                  <View style={{flexDirection:'row', alignItems:'center'}}>
                      <Ionicons name="medkit" size={30} color="#fff" style={{marginRight:10}}/>
                      <Text style={{fontSize:22, fontWeight:'bold', color:'#fff'}}>FARMACIA</Text>
                  </View>
                  <TouchableOpacity onPress={()=>setShowSOSModal(false)}><Ionicons name="close-circle" size={36} color="#fff"/></TouchableOpacity>
              </View>
              {/* SEARCH BAR SOS */}
              <View style={{padding:10, backgroundColor:THEME.danger}}>
                  <View style={[styles.searchBox, {backgroundColor:'#fff', marginBottom:0}]}>
                      <Ionicons name="search" size={20} color="#666"/>
                      <TextInput style={styles.searchInput} placeholder="Cerca fungicida, diserbante..." value={sosSearch} onChangeText={(t) => { setSosSearch(t); if(t.length > 3) trackEvent('RICERCA_FARMACIA', t); }}/>
                  </View>
              </View>
              <View style={{padding:15, backgroundColor:'#FFEBEE'}}><Text style={{color:THEME.danger, fontSize:12, fontWeight:'bold', textAlign:'center'}}>⚠️ ATTENZIONE: Questi prodotti richiedono cautela. Usa le dosi indicate e consulta le schede di sicurezza.</Text></View>
              
              <FlatList 
                contentContainerStyle={{padding:15}}
                data={productsDB
                    .filter(p => {
                        if (!['FUNGICIDA','DISERBANTE','INSETTICIDA','FUNGICIDA BIO','DISERBANTE PFnPE', 'INSETTICIDA PFnPE'].includes(p.categoria.toUpperCase())) return false;
                        if (sosSearch && getSearchScore(p, sosSearch).count === 0) return false;
                        return true;
                    })
                    .sort((a, b) => {
                        if (!sosSearch) return 0;
                        const scoreA = getSearchScore(a, sosSearch);
                        const scoreB = getSearchScore(b, sosSearch);
                        if (scoreA.qty !== scoreB.qty) return scoreB.qty - scoreA.qty;
                        return scoreB.count - scoreA.count;
                    })
                }
                keyExtractor={i => i.id.toString()}
                renderItem={({item}) => (
                    <TouchableOpacity onPress={()=>{setSelectedProduct(item); trackEvent('VISUALIZZA_FARMACO', item.nome); }} style={{flexDirection:'row', backgroundColor:'#fff', marginBottom:15, borderRadius:12, shadowColor:'#000', shadowOpacity:0.1, elevation:3, borderLeftWidth:6, borderColor:item.colore}}>
                        <View style={{padding:20, flex:1}}>
                            <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                                <Text style={{fontSize:10, fontWeight:'bold', color:item.colore}}>{getCleanCategoryName(item.categoria)}</Text>
                            </View>
                            <HighlightText baseStyle={{fontSize:18, fontWeight:'bold', color:'#333', marginVertical:5}} text={item.nome} term={sosSearch} />
                            <HighlightText baseStyle={{fontSize:12, color:'#666'}} text={item.descrizione} term={sosSearch} />
                        </View>
                        <View style={{justifyContent:'center', paddingRight:20}}>
                            <Ionicons name="chevron-forward" size={24} color="#ccc"/>
                        </View>
                    </TouchableOpacity>
                )}
              />
          </SafeAreaView>
      </Modal>

      {/* --- MODAL PREFERITI (NUOVO) --- */}
      <Modal visible={showFavModal} animationType="slide">
          <SafeAreaView style={{flex:1, backgroundColor:'#fff'}}>
              <View style={{padding:20, borderBottomWidth:1, borderColor:'#eee', flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                  <Text style={{fontSize:22, fontWeight:'bold', color:THEME.danger}}>I MIEI PREFERITI ❤️</Text>
                  <TouchableOpacity onPress={()=>setShowFavModal(false)}><Ionicons name="close" size={30}/></TouchableOpacity>
              </View>
              {favorites.length === 0 ? (
                  <View style={{flex:1, justifyContent:'center', alignItems:'center'}}>
                      <Ionicons name="heart-dislike-outline" size={60} color="#ccc"/>
                      <Text style={{color:'#999', marginTop:10}}>Nessun prodotto nei preferiti</Text>
                  </View>
              ) : (
                  <FlatList 
                    contentContainerStyle={{padding:15}}
                    data={productsDB.filter(p => favorites.includes(p.id))}
                    keyExtractor={i => i.id.toString()}
                    renderItem={({item}) => {
                        const inCart = cartItems.some(p=>p.id===item.id);
                        const inMix = mixItems.some(p=>p.id===item.id);
                        return (
                           <View style={[styles.card, {borderColor: item.colore || '#eee', borderWidth: 2}, (inCart || inMix) && {backgroundColor:'#f9f9f9'}]}>
                               <TouchableOpacity style={styles.cardLeft} onPress={()=>toggleFavorite(item.id)}><Ionicons name="heart" size={26} color={THEME.danger}/></TouchableOpacity>
                               <TouchableOpacity style={styles.cardCenter} onPress={()=>{setSelectedProduct(item); }}>
                                   <Text style={styles.cardBrand}>{item.marca}</Text>
                                   <Text style={styles.cardTitle}>{item.nome}</Text>
                                   <Text style={styles.cardSub}>{item.categoria}</Text>
                               </TouchableOpacity>
                               <View style={styles.cardRight}>
                                   <TouchableOpacity onPress={() => toggleMix(item)} style={{marginBottom:15}}><View style={{backgroundColor:inMix?THEME.primary:'#fff', padding:8, borderRadius:8, borderWidth:1, borderColor:inMix?THEME.primary:THEME.secondary}}><Ionicons name={inMix?"flask":"flask-outline"} size={22} color={inMix?"#fff":THEME.iconInactive}/></View></TouchableOpacity>
                                   <TouchableOpacity onPress={() => toggleCart(item)}><View style={{backgroundColor:inCart?THEME.accent:'#fff', padding:8, borderRadius:8, borderWidth:1, borderColor:inCart?THEME.accent:THEME.secondary}}><Ionicons name={inCart?"cart":"cart-outline"} size={22} color={inCart?"#fff":THEME.iconInactive}/></View></TouchableOpacity>
                               </View>
                           </View>
                        );
                    }}
                  />
              )}
          </SafeAreaView>
      </Modal>

      {/* --- MODAL SETTINGS (NUOVO) --- */}
      <Modal visible={showSettingsModal} animationType="slide" transparent>
            <View style={styles.modalOverlay}>
                <View style={styles.modalCard}>
                    <Ionicons name="settings-outline" size={40} color={THEME.textDark} />
                    <Text style={{fontSize:22, fontWeight:'bold', color:THEME.textDark, marginTop:10, marginBottom:20}}>Modifica Profilo</Text>
                    
                    <View style={{flexDirection:'row', gap:10, marginBottom:15, width:'100%'}}>
                        <TouchableOpacity onPress={()=>setWelcomeData({...welcomeData, tipo: 'HOBBISTA'})} style={{flex:1, padding:15, borderRadius:10, borderWidth:2, borderColor: welcomeData.tipo==='HOBBISTA'?THEME.accent:'#eee', backgroundColor: welcomeData.tipo==='HOBBISTA'?'#E8F5E9':'#fff', alignItems:'center'}}>
                            <Ionicons name="home-outline" size={24} color={welcomeData.tipo==='HOBBISTA'?THEME.accent:'#999'}/>
                            <Text style={{fontWeight:'bold', marginTop:5, color:welcomeData.tipo==='HOBBISTA'?THEME.textDark:'#999'}}>HOBBISTA</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={()=>setWelcomeData({...welcomeData, tipo: 'GIARDINIERE'})} style={{flex:1, padding:15, borderRadius:10, borderWidth:2, borderColor: welcomeData.tipo==='GIARDINIERE'?THEME.primary:'#eee', backgroundColor: welcomeData.tipo==='GIARDINIERE'?'#E8EAF6':'#fff', alignItems:'center'}}>
                            <Ionicons name="construct-outline" size={24} color={welcomeData.tipo==='GIARDINIERE'?THEME.primary:'#999'}/>
                            <Text style={{fontWeight:'bold', marginTop:5, color:welcomeData.tipo==='GIARDINIERE'?THEME.primary:'#999'}}>GIARDINIERE</Text>
                        </TouchableOpacity>
                    </View>

                    <TextInput style={[styles.inputContainer, {backgroundColor:'#fff'}]} placeholder="Città o CAP" value={welcomeData.citta} onChangeText={t=>setWelcomeData({...welcomeData, citta:t})}/>
                    
                    {welcomeData.tipo === 'HOBBISTA' && (
                        <TextInput style={[styles.inputContainer, {backgroundColor:'#fff'}]} placeholder="MQ Prato" keyboardType="numeric" value={welcomeData.mq} onChangeText={t=>setWelcomeData({...welcomeData, mq:t})}/>
                    )}

                    <TouchableOpacity style={[styles.btnBig, {marginTop:10}]} onPress={handleUpdateProfile}>
                        <Text style={styles.btnText}>SALVA MODIFICHE</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={()=>setShowSettingsModal(false)} style={{marginTop:15}}>
                        <Text style={{color:THEME.danger}}>Annulla</Text>
                    </TouchableOpacity>
                </View>
            </View>
      </Modal>

      {/* --- DETAIL MODAL (CALCOLATORE POTENZIATO E COMPATTO) --- */}
      <Modal visible={selectedProduct!==null} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setSelectedProduct(null)}>
        {selectedProduct && (
            <View style={{flex:1, backgroundColor:'#fff'}}>
                {/* HEADER COMPATTO: Padding ridotto per vedere più contenuto */}
                <View style={{backgroundColor: selectedProduct.colore || '#C8E6C9', padding:15, paddingTop:15, paddingBottom:15}}>
                      <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
                          <TouchableOpacity onPress={()=>setSelectedProduct(null)} style={{marginBottom:5}}>
                              <Ionicons name="close-circle" size={32} color={'rgba(0,0,0,0.5)'}/>
                          </TouchableOpacity>
                          {/* PREZZO SCONTATO */}
                          <Text style={{fontSize:20, fontWeight:'900', color:'#fff', textShadowColor:'rgba(0,0,0,0.2)', textShadowRadius:3}}>
                              € {applyDisc(parseFloat(selectedProduct.prezzo)||0, getDiscount(selectedProduct)).toFixed(2)}
                          </Text>
                      </View>
                      
                      <Text style={{fontSize:22, fontWeight:'bold', color:'#fff', lineHeight:26}}>{selectedProduct.nome}</Text>
                      <Text style={{fontSize:12, fontWeight:'bold', color:'rgba(255,255,255,0.9)', marginTop:2, textTransform:'uppercase'}}>
                          {selectedProduct.marca} • {selectedProduct.categoria}
                      </Text>
                 </View>

                <ScrollView contentContainerStyle={{padding:15}}>
                      {/* CALCOLATRICE PIU COMPATTA */}
                      <View style={[styles.newCalcBox, {marginTop:10, padding:15}]}>
                          <Text style={{textAlign:'center', fontWeight:'bold', color:THEME.textDark, fontSize:10, marginBottom:5}}>MQ DA TRATTARE</Text>
                          <TextInput style={[styles.newCalcInput, {fontSize:20, padding:10, marginBottom:10, width:'60%'}]} placeholder="0" keyboardType="numeric" value={lawnSize} onChangeText={updateLawnSize} onBlur={() => trackEvent('CALCOLO_DOSI', selectedProduct.nome, parseFloat(lawnSize))} />
                          
                          {lawnSize ? (<>{(() => {
                              const specs = calcSpecs(selectedProduct, lawnSize); 
                              return (
                                 <View style={{flexDirection:'row', justifyContent:'space-around', width:'100%'}}>
                                     {specs.qRad > 0 && (
                                         <View style={{alignItems:'center'}}>
                                             <Text style={{fontSize:10, color:'#8D6E63', fontWeight:'bold'}}>RADICALE</Text>
                                             <Text style={[styles.newCalcResult, {fontSize:24, color:'#8D6E63'}]}>{specs.qRad.toFixed(2)} {specs.unit}</Text>
                                             <Text style={{fontSize:12, color:'#666', fontWeight:'bold'}}>(€ {specs.costRad.toFixed(2)})</Text>
                                         </View>
                                     )}
                                     {specs.qFog > 0 && (
                                         <View style={{alignItems:'center'}}>
                                             <Text style={{fontSize:10, color:THEME.textDark, fontWeight:'bold'}}>FOGLIARE</Text>
                                             <Text style={[styles.newCalcResult, {fontSize:24}]}>{specs.qFog.toFixed(2)} {specs.unit}</Text>
                                             <Text style={{fontSize:12, color:'#666', fontWeight:'bold'}}>(€ {specs.costFog.toFixed(2)})</Text>
                                         </View>
                                     )}
                                 </View>
                              )
                          })()}<Text style={{textAlign:'center', fontSize:9, color:'#777', marginTop:10}}>* Costo stimato</Text></>) : (<Text style={{textAlign:'center', fontSize:20, color:'#ccc', marginVertical:10}}>- {selectedProduct.unita_misura === 'L' || selectedProduct.unita_misura === 'ML' ? 'ml' : 'Kg'}</Text>)}
                      </View>

                      <Text style={{fontSize:12, color:'#999', marginTop:15, marginBottom:5}}>DESCRIZIONE TECNICA</Text><Text style={{fontSize:14, color:'#333', lineHeight:22}}>{selectedProduct.descrizione}</Text>
                      <Text style={{fontSize:12, color:'#999', marginTop:15, marginBottom:5}}>COMPOSIZIONE CHIMICA</Text><View style={{backgroundColor:'#F5F5F5', padding:10, borderRadius:10, borderWidth:1, borderColor:'#eee'}}><Text style={{color:'#444', fontStyle:'italic', fontSize:12}}>{selectedProduct.composizione || "Non specificata"}</Text></View>
                 </ScrollView>
            </View>
        )}
      </Modal>

      {/* Modal Mix AGGIORNATO CON PREZZI DINAMICI E HEADER COMPATTO */}
      <Modal visible={showMixListModal} animationType="slide"><SafeAreaView style={{flex:1, backgroundColor:'#fff'}}><View style={{flex:1, padding:20}}><View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:15}}><Text style={[styles.modalTitle, {color:THEME.primary}]}>Trattamento Tecnico</Text><TouchableOpacity onPress={()=>setShowMixListModal(false)}><Ionicons name="close" size={30}/></TouchableOpacity></View>{(() => {const hasRadicalOnly = mixItems.some(i => parseFloat(i.dose_radicale) > 0 && parseFloat(i.dose_fogliare) === 0); const hasFoliarOnly = mixItems.some(i => parseFloat(i.dose_fogliare) > 0 && parseFloat(i.dose_radicale) === 0); if (hasRadicalOnly && hasFoliarOnly) {return (<View style={{backgroundColor:'#FFEBEE', padding:10, borderRadius:8, marginBottom:10, flexDirection:'row', alignItems:'center'}}><Ionicons name="warning" size={24} color={THEME.danger} style={{marginRight:10}}/><Text style={{color:THEME.danger, fontSize:12, flex:1, fontWeight:'bold'}}>ATTENZIONE: Stai mischiando prodotti esclusivamente radicali con prodotti esclusivamente fogliari!</Text></View>)}})()}<View style={{backgroundColor:THEME.secondary, padding:10, borderRadius:10, marginBottom:15}}><Text style={{fontSize:12, fontWeight:'bold', color:THEME.primary}}>AREA TOTALE (MQ)</Text><TextInput style={styles.mqInput} placeholder="0" keyboardType="numeric" value={lawnSize} onChangeText={updateLawnSize}/></View>
      <ScrollView>{mixItems.map((p, idx) => {
          const specs = calcSpecs(p, lawnSize);
          const totalCost = specs.costRad + specs.costFog;
          const unitPrice = applyDisc(parseFloat(p.prezzo)||0, getDiscount(p));
          
          return (
          <View key={idx} style={styles.cartItem}>
              <View style={{flex:1}}>
                  {/* PREZZO NEL MIX DINAMICO */}
                  <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                      <Text style={{fontWeight:'bold', color:THEME.primary, flex:1}}>{p.nome}</Text>
                      {lawnSize ? (
                          <Text style={{fontWeight:'bold', color:THEME.accent, fontSize:14, marginRight:10}}>€ {totalCost.toFixed(2)}</Text>
                      ) : (
                          <Text style={{fontWeight:'bold', color:'#999', fontSize:12, marginRight:10}}>€ {unitPrice.toFixed(2)} / {p.unita_misura}</Text>
                      )}
                  </View>
                  <View style={{marginTop:5}}>{specs.qRad > 0 && (<View style={{flexDirection:'row', alignItems:'center', marginBottom:2}}><View style={{backgroundColor:'#FFF3E0', paddingHorizontal:6, paddingVertical:2, borderRadius:4, marginRight:5}}><Text style={{fontSize:10, color:'#5D4037'}}>RAD</Text></View>{lawnSize ? <Text style={{fontWeight:'bold', color:'#333'}}>{specs.qRad.toFixed(2)} {specs.unit}</Text> : <Text style={{color:'#999'}}>-</Text>}</View>)}{specs.qFog > 0 && (<View style={{flexDirection:'row', alignItems:'center'}}><View style={{backgroundColor:'#E8F5E9', paddingHorizontal:6, paddingVertical:2, borderRadius:4, marginRight:5}}><Text style={{fontSize:10, color:'#1B5E20'}}>FOG</Text></View>{lawnSize ? <Text style={{fontWeight:'bold', color:'#333'}}>{specs.qFog.toFixed(2)} {specs.unit}</Text> : <Text style={{color:'#999'}}>-</Text>}</View>)}</View>
              </View>
              <View style={{alignItems:'flex-end'}}><TouchableOpacity onPress={()=>toggleMix(p)} style={{marginTop:5}}><Ionicons name="trash-outline" size={20} color={THEME.danger}/></TouchableOpacity></View>
          </View>)})}</ScrollView></View></SafeAreaView></Modal>
      
      {/* Modal Carrello AGGIORNATO (NOME CLIENTE + FIX PREZZI) */}
      <Modal visible={showCartModal} animationType="slide"><SafeAreaView style={{flex:1, backgroundColor:'#fff'}}><View style={{flex:1, padding:20}}>
            <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:10, alignItems:'center'}}>
                <Text style={[styles.modalTitle, {color:THEME.accent}]}>Preventivo Vendita</Text>
                <TouchableOpacity onPress={()=>setShowCartModal(false)}><Ionicons name="close" size={30}/></TouchableOpacity>
            </View>
            
            {/* NUOVO: Input per nome cliente */}
            <TextInput 
                style={{backgroundColor:'#f0f0f0', padding:10, borderRadius:8, marginBottom:15, fontWeight:'bold'}} 
                placeholder="Intestazione Ordine (es. Mario Rossi)" 
                value={customerName} 
                onChangeText={setCustomerName}
            />

            <ScrollView>{cartItems.map((p, idx) => {
                const price = applyDisc(parseFloat(p.prezzo)||0, getDiscount(p)); 
                const qty = parseFloat(p.quantity)||0; 
                const displayUnit = getDisplayUnit(p.unita_misura); 
                return (<View key={idx} style={styles.cartItem}>
                    <View style={{flex:1}}>
                        <Text style={{fontWeight:'bold', color:THEME.textDark, fontSize:15}}>{p.nome}</Text>
                        {/* FIX: Rimosso /ml o /lt che confondeva. Mostra solo il prezzo unitario pulito */}
                        <Text style={{fontSize:12, color:THEME.primary}}>€ {price.toFixed(2)} cad.</Text> 
                    </View>
                    <View style={{alignItems:'flex-end'}}>
                        <View style={{flexDirection:'row', alignItems:'center', backgroundColor:THEME.secondary, borderRadius:8}}>
                            <TextInput style={styles.qtyInput} placeholder="0" keyboardType="numeric" value={p.quantity} onChangeText={(t)=>updateCartQuantity(p.id, t)}/>
                            <Text style={{paddingRight:10, fontSize:12, fontWeight:'bold', color:'#666'}}>{displayUnit}</Text>
                        </View>
                        <Text style={{fontWeight:'bold', marginTop:5, fontSize:15}}>€ {(qty * price).toFixed(2)}</Text>
                        <TouchableOpacity onPress={()=>toggleCart(p)} style={{marginTop:5}}><Text style={{color:THEME.danger, fontSize:10}}>Rimuovi</Text></TouchableOpacity>
                    </View>
                </View>);})}</ScrollView>
            <View style={{borderTopWidth:1, borderColor:'#eee', paddingTop:15}}>
                <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:10}}>
                    <Text style={{fontSize:16, color:'#666'}}>Totale:</Text>
                    <Text style={{fontSize:24, fontWeight:'bold', color:THEME.accent}}>€ {calculateCartTotal().toFixed(2)}</Text>
                </View>
                <TouchableOpacity style={styles.btnBig} onPress={printPDF}><Ionicons name="print-outline" size={24} color="#fff" style={{marginRight:10}}/><Text style={styles.btnText}>STAMPA PDF</Text></TouchableOpacity>
            </View>
       </View></SafeAreaView></Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex:1, justifyContent:'center', alignItems:'center', backgroundColor:'#fff', padding:20 },
  header: { backgroundColor:'#fff', padding:10, paddingTop:Platform.OS==='android'?40:10, borderBottomWidth:1, borderColor:'#eee' }, // HEADER COMPATTO
  card: { flexDirection:'row', backgroundColor:'#fff', borderRadius:16, marginBottom:10, padding:10, alignItems:'center', shadowColor:'#000', shadowOpacity:0.05, shadowRadius:8, elevation:3 }, 
  cardLeft: { paddingRight:15, borderRightWidth:1, borderColor:'#f5f5f5', justifyContent:'center' },
  cardCenter: { flex:1, paddingHorizontal:10 },
  cardRight: { paddingLeft:10, alignItems:'flex-end', justifyContent:'center' }, 
  cardBrand: { fontSize:10, fontWeight:'bold', color:'#999', textTransform:'uppercase' },
  cardTitle: { fontSize:14, fontWeight:'bold', color:THEME.textDark, marginVertical:2 }, 
  cardSub: { fontSize:10, color:'#555' },
  searchBox: { flexDirection:'row', alignItems:'center', backgroundColor:THEME.secondary, borderRadius:12, paddingHorizontal:10, height:48 },
  searchInput: { flex:1, marginLeft:10, fontSize:16 },
  mqInputSmall: { fontSize:24, fontWeight:'bold', textAlign:'center', borderBottomWidth:2, borderColor:THEME.accent, width:'60%', alignSelf:'center', padding:5 },
  mqInput: { fontSize:28, fontWeight:'bold', textAlign:'center', borderBottomWidth:1, borderColor:THEME.primary },
  qtyInput: { width:50, textAlign:'center', padding:10, fontWeight:'bold', fontSize:16 },
  chip: { paddingHorizontal:12, paddingVertical:6, borderRadius:20, backgroundColor:'#f0f0f0', marginRight:6 }, // CHIP PIÙ PICCOLI
  chipText: { fontSize:11, fontWeight:'600' },
  chipSmall: { paddingHorizontal:10, paddingVertical:4, borderRadius:15, borderWidth:1, borderColor:'#eee', marginRight:6 },
  chipTextSmall: { fontSize:10, fontWeight:'600', color:'#555' },
  btnBig: { backgroundColor:THEME.accent, padding:18, borderRadius:16, alignItems:'center', width:'100%', flexDirection:'row', justifyContent:'center' },
  btnOutline: { borderWidth:1, borderColor:THEME.textDark, padding:16, borderRadius:12, width:'100%', alignItems:'center' },
  btnText: { color:'#fff', fontWeight:'bold', fontSize:16 },
  fab: { paddingHorizontal:20, paddingVertical:12, borderRadius:30, flexDirection:'row', alignItems:'center', elevation:8, shadowColor:'#000', shadowOpacity:0.3, shadowOffset:{width:0,height:4} },
  fabText: { color:'#fff', fontWeight:'bold', marginLeft:5, fontSize:12 },
  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', padding:30 },
  modalCard: { backgroundColor:'#fff', padding:20, borderRadius:20, alignItems:'center', width:'90%' }, 
  modalTitle: { fontSize:24, fontWeight:'bold', color:THEME.textDark, marginBottom:10 },
  cartItem: { flexDirection:'row', alignItems:'center', paddingVertical:15, borderBottomWidth:1, borderColor:'#f0f0f0' },
  inputContainer: { flexDirection:'row', alignItems:'center', backgroundColor:'#F5F7FA', borderWidth:1, borderColor:'#E0E0E0', borderRadius:12, paddingHorizontal:15, paddingVertical:12, width:'100%', marginBottom:15 },
  dropContainer: { width:'100%', maxHeight:150, borderWidth:1, borderColor:'#E0E0E0', borderRadius:12, marginBottom:15, backgroundColor:'#fff', elevation: 5, zIndex: 1000 },
  dropItem: { padding:15, borderBottomWidth:1, borderColor:'#f0f0f0' },
  cardForm: { backgroundColor:'#fff', padding:20, borderRadius:15, shadowColor:'#000', shadowOpacity:0.05, shadowRadius:10, elevation:3 },
  sectionTitle: { fontSize:16, fontWeight:'900', color:THEME.primary, marginBottom:15 },
  label: { fontSize:12, fontWeight:'bold', color:'#666', marginBottom:5, marginTop:10 },
  inputSmall: { backgroundColor:'#F5F7FA', padding:10, borderRadius:8, borderWidth:1, borderColor:'#E0E0E0' },
  inputDiscount: { backgroundColor:'#FFFDE7', padding:10, borderRadius:8, borderWidth:1, borderColor:'#FFEB3B', textAlign:'center', fontWeight:'bold' },
  table: { marginTop:10, backgroundColor:'#fff', borderRadius:10, overflow:'hidden', borderWidth:1, borderColor:'#eee' },
  tableRow: { flexDirection:'row', borderBottomWidth:1, borderColor:'#eee', alignItems:'center' },
  col: { padding:10, fontSize:13, color:'#333' },
  tab: { flex:1, alignItems:'center', padding:10, borderRadius:8 },
  activeTab: { backgroundColor:'#fff', shadowColor:'#000', shadowOpacity:0.1, shadowRadius:2, elevation:2 },
  tabText: { fontWeight:'bold', color:'#999' },
  activeTabText: { color:THEME.primary },
  newDoseCard: { flex:1, backgroundColor:'#F5F5F5', borderRadius:12, padding:15, alignItems:'center', justifyContent:'center' },
  newPeriodCard: { flexDirection:'row', alignItems:'center', backgroundColor:'#EDE7F6', borderColor:'#7E57C2', borderWidth:1, borderRadius:12, padding:15, marginTop:0 },
  newCalcBox: { backgroundColor:'#F9FBE7', padding:30, borderRadius:20, marginTop:30, alignItems:'center' },
  newCalcInput: { backgroundColor:'#fff', width:'80%', fontSize:24, fontWeight:'bold', textAlign:'center', padding:15, borderRadius:10, elevation:2, marginBottom:20 },
  newCalcResult: { fontSize:48, fontWeight:'bold', color:'#5E35B1' },
  
  // METEO STYLE
  weatherCard: { backgroundColor:'#fff', padding:10, borderRadius:12, marginBottom:5, shadowColor:'#000', shadowOpacity:0.05, shadowRadius:5, elevation:2 } // METEO RIDOTTO
});