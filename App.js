import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, SafeAreaView,
  ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';

// --- CONFIGURAZIONE SUPABASE ---
const supabaseUrl = 'https://azkpckrybldypqwdksjc.supabase.co';
const supabaseKey = 'sb_publishable_b9EMDrQXatPARFQrhpoTVA_gQdx7kgq';
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

// --- TEMA GRAFICO ---
const THEME = {
  headerBg: '#FFFFFF', bg: '#F5F7FA', card: '#FFFFFF',
  textDark: '#1B5E20', accent: '#00C853', primary: '#1A237E',
  danger: '#D32F2F', warning: '#FF9800', info: '#2196F3',
  secondary: '#ECEFF1', iconInactive: '#B0BEC5', tableHeader: '#E0E0E0',
  fogliare: '#E8F5E9', radicale: '#FFF3E0' 
};

// --- COMPONENTE EVIDENZIATORE (FIXED) ---
const HighlightText = ({ text, term, baseStyle }) => {
    if (!text) return null;
    const str = String(text);
    
    // Se non cerco nulla, ritorno testo normale
    if (!term || term.trim() === '') {
        return <Text style={baseStyle}>{str}</Text>;
    }

    // Escape per evitare crash con caratteri speciali (es. +, *)
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Regex che cattura il termine (case insensitive)
    const regex = new RegExp(`(${escapedTerm})`, 'gi');
    
    // Split mantiene i match negli indici dispari dell'array
    const parts = str.split(regex);

    return (
        <Text style={baseStyle}>
            {parts.map((part, i) => 
                // Se l'indice è dispari, è la parola cercata -> Evidenzia
                (i % 2 === 1) ? (
                    <Text key={i} style={{ backgroundColor: '#C8E6C9', color: '#1B5E20', fontWeight: 'bold' }}>
                        {part}
                    </Text>
                ) : (
                    <Text key={i}>{part}</Text>
                )
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

export default function App() {
  const [appIsReady, setAppIsReady] = useState(false);
  const [userRole, setUserRole] = useState(null); 
  const [session, setSession] = useState(null);
  const [isPendingApproval, setIsPendingApproval] = useState(false);

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
  const [selectedProduct, setSelectedProduct] = useState(null); 
  const [lawnSize, setLawnSize] = useState(''); 
  const [favorites, setFavorites] = useState([]);
  const [inputCodicePartner, setInputCodicePartner] = useState('');
  const [activePartners, setActivePartners] = useState([]); 
  
  // ALERT SYSTEM
  const [clientAlerts, setClientAlerts] = useState([]);
  const [selectedAlert, setSelectedAlert] = useState(null); 

  // DASHBOARD AGENTE
  const [agentProfileId, setAgentProfileId] = useState(null); 
  const [agentTab, setAgentTab] = useState('CODES'); 
  const [agentCodes, setAgentCodes] = useState([]); 
  const [editingId, setEditingId] = useState(null);
  const [newCodeData, setNewCodeData] = useState({ descrizione_interna: '', codice_sconto: '', s_sementi: '', s_granulari: '', s_liquidi: '' });
  const [alertMessage, setAlertMessage] = useState('');
  const [alertProducts, setAlertProducts] = useState([]); 
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [sentAlerts, setSentAlerts] = useState([]);

  useEffect(() => { 
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

  const loadCommonData = async () => {
      const { data } = await supabase.from('Prodotti').select('*').order('marca').order('nome');
      if(data) {
          setProductsDB(data);
          const brands = [...new Set(data.map(p => p.marca).filter(m => m))];
          setAvailableBrands(brands);
          if(brands.length > 0) setRegCompany(brands[0]);
      }
      // LOAD SAVED LAWN SIZE
      const savedSize = await AsyncStorage.getItem('LAWN_SIZE');
      if(savedSize) setLawnSize(savedSize);
  };

  useEffect(() => {
    if (activePartners.length > 0) refreshAllAlerts();
    else setClientAlerts([]); 
  }, [activePartners]);

  const refreshAllAlerts = async () => {
      const emails = activePartners.map(p => p.email);
      if(emails.length === 0) return;
      const { data } = await supabase.from('alerts').select('*').in('agent_email', emails).order('created_at', {ascending: false});
      if(data && data.length > 0) setClientAlerts(data);
  };

  const handleDismissAlert = () => { setSelectedAlert(null); setClientAlerts([]); }; 
  const handlePostponeAlert = () => { setSelectedAlert(null); }; 

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

  // AGENT LOGIC
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

  // CLIENT LOGIC
  const validaCodice = async () => {
     if(!inputCodicePartner) return;
     const code = inputCodicePartner.toUpperCase().trim();
     if(activePartners.some(p => p.codice_sconto === code)) { Alert.alert("Già attivo", "Codice già in uso."); setInputCodicePartner(''); return; }
     const { data, error } = await supabase.from('listini').select(`*, agenti ( nome_agente, azienda, email, approvato )`).eq('codice_sconto', code).single();
     if(error || !data || !data.agenti?.approvato) { Alert.alert("Errore", "Codice non valido."); return; }
     const partnerData = { id: data.id, codice_sconto: data.codice_sconto, s_sementi: data.s_sementi, s_granulari: data.s_granulari, s_liquidi: data.s_liquidi, nome_agente: data.agenti.nome_agente, azienda: data.agenti.azienda, email: data.agenti.email };
     setActivePartners([...activePartners.filter(p => p.azienda !== partnerData.azienda), partnerData]); 
     setDismissCount(0); 
     Alert.alert("Attivato", `Sconti ${partnerData.azienda} OK.`); 
     setInputCodicePartner('');
     setSelectedBrand('TUTTI'); 
  };
  const removePartner = (codice) => { setActivePartners(activePartners.filter(p => p.codice_sconto !== codice)); };
  const getDiscount = (p) => { const partner = activePartners.find(ap => (ap.azienda||'').toUpperCase() === (p.marca||'').toUpperCase()); if (!partner) return '0'; const c = (p.categoria||'').toUpperCase(); return (c.includes('SEMENTI')) ? partner.s_sementi : (c.includes('LIQUID')||c.includes('BIO')||c.includes('BAGNANT') ? partner.s_liquidi : partner.s_granulari); };
  const applyDisc = (price, discStr) => { if(!discStr || discStr==='0') return price; let final = price; discStr.split('+').forEach(d => { const val = parseFloat(d); if(!isNaN(val) && val > 0) final = final - (final * (val/100)); }); return final; };

  // --- CALCOLO SPECIFICHE ---
  const calcSpecs = (p, mq) => { 
      const size = parseFloat(mq) || 0; 
      const price = parseFloat(p.prezzo) || 0; 
      const finalPriceUnit = applyDisc(price, getDiscount(p)); 
      const isLiquid = ['ML','L','LT'].includes((p.unita_misura||'').toUpperCase()); 
      
      const qRadRaw = (parseFloat(p.dose_radicale||0) * size);
      const qFogRaw = (parseFloat(p.dose_fogliare||0) * size);
      
      // DISPLAY: ml per liquidi, Kg per solidi
      const qRadDisplay = isLiquid ? qRadRaw : (qRadRaw / 1000);
      const qFogDisplay = isLiquid ? qFogRaw : (qFogRaw / 1000);
      const unitDisplay = isLiquid ? 'ml' : 'Kg';

      // COSTO (Stima): Usiamo standard Kg/L per moltiplicazione prezzo
      const qRadNorm = qRadRaw / 1000; 
      const qFogNorm = qFogRaw / 1000;
      const cost = Math.max(qRadNorm, qFogNorm) * finalPriceUnit;

      return { qRad: qRadDisplay, qFog: qFogDisplay, unit: unitDisplay, totalCost: cost }; 
  };

  const updateCartQuantity = (id, txt) => { setCartItems(cartItems.map(p => p.id === id ? {...p, quantity: txt} : p)); };
  const calculateCartTotal = () => { return cartItems.reduce((acc, p) => { const q = parseFloat(p.quantity) || 0; const price = applyDisc(parseFloat(p.prezzo)||0, getDiscount(p)); return acc + (q * price); }, 0); };
  const toggleFavorite = async (id) => { let newFavs = favorites.includes(id) ? favorites.filter(fid => fid !== id) : [...favorites, id]; setFavorites(newFavs); await AsyncStorage.setItem('FAVS', JSON.stringify(newFavs)); };
  const toggleMix = (product) => { const exists = mixItems.find(x => x.id === product.id); if (exists) setMixItems(mixItems.filter(x => x.id !== product.id)); else { setMixItems([...mixItems, product]); } };
  const toggleCart = (product) => { const exists = cartItems.find(p => p.id === product.id); if (exists) setCartItems(cartItems.filter(p => p.id !== product.id)); else setCartItems([...cartItems, { ...product, quantity: '' }]); };
  const updateLawnSize = (t) => { setLawnSize(t); AsyncStorage.setItem('LAWN_SIZE', t); };

  // --- LOGICA DI RICERCA OTTIMIZZATA ---
  const getSearchScore = (item, term) => {
      if (!term) return { qty: 0, count: 0 };
      const t = term.toLowerCase();
      // Concatena tutti i campi per la ricerca
      const text = `${item.nome} ${item.descrizione||''} ${item.composizione||''} ${item.dose_radicale||''} ${item.dose_fogliare||''} ${item.periodo_uso||''}`.toLowerCase();
      
      // 1. Frequenza (Quante volte appare la parola)
      const count = text.split(t).length - 1;
      if (count === 0) return { qty: 0, count: 0 };

      // 2. Quantità (Estrae il numero che segue la parola. Es: "Ferro 6%")
      const match = text.match(new RegExp(`${t}[^0-9]{0,15}?([0-9]+([.,][0-9]+)?)`));
      const qty = match ? parseFloat(match[1].replace(',', '.')) : 0;

      return { qty, count };
  };

  // PDF STAMPA
  const printPDF = async () => { 
      let total = 0; 
      const rows = cartItems.map(p => { 
          const q = parseFloat(p.quantity) || 0; 
          const price = applyDisc(parseFloat(p.prezzo)||0, getDiscount(p)); 
          const cost = q * price; 
          total += cost; 
          const isLiquid = ['ML','L','LT'].includes((p.unita_misura||'').toUpperCase());
          const displayUnit = isLiquid ? 'L' : 'Kg';
          return `<tr><td style="padding:10px;border-bottom:1px solid #ddd"><b>${p.nome}</b><br/><span style="font-size:10px;color:#666">${p.marca}</span></td><td style="padding:10px;border-bottom:1px solid #ddd;text-align:center;">${p.quantity || '0'} <span style="font-size:10px">${displayUnit}</span></td><td style="padding:10px;border-bottom:1px solid #ddd;text-align:right;">€ ${cost.toFixed(2)}</td></tr>`; 
      }).join(''); 
      const html = `<html><body style="font-family:Helvetica;padding:40px;"><div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #00C853;padding-bottom:20px;"><div><h1 style="color:#1B5E20;margin:0;">Preventivo</h1><p style="margin:0;color:#666;font-size:12px;">AgriManager powered by Sinelica</p></div><div style="text-align:right;"><p>Data: ${new Date().toLocaleDateString()}</p><p>Listini attivi: <b>${activePartners.length}</b></p></div></div><table style="width:100%;border-collapse:collapse;margin-top:30px;"><tr style="background:#f5f5f5;color:#333"><th style="text-align:left;padding:10px">PRODOTTO</th><th style="text-align:center;">QUANTITÀ</th><th style="text-align:right;">PREZZO</th></tr>${rows}</table><div style="margin-top:30px;text-align:right;"><p style="font-size:14px;color:#666;">TOTALE PREVENTIVO</p><h2 style="color:#00C853;margin:0;">€ ${total.toFixed(2)}</h2></div></body></html>`; 
      try { const { uri } = await Print.printToFileAsync({ html }); await Sharing.shareAsync(uri); } catch(e){} 
  };

  if(!appIsReady) return <View style={styles.center}><ActivityIndicator size="large" color={THEME.accent}/></View>;

  // UI: LOGIN
  if(!userRole && !isPendingApproval) return (
    <View style={styles.center}>
       <View style={{marginBottom:40}}><BrandLogo scale={1.5}/></View>
       
       <TouchableOpacity style={styles.btnBig} onPress={()=>setUserRole('CLIENTE')}>
           <Text style={styles.btnText}>ENTRA NELLO SHOP</Text>
           <Ionicons name="cart-outline" size={24} color="#fff" style={{marginLeft:10}}/>
       </TouchableOpacity>

       <TouchableOpacity style={[styles.btnOutline,{marginTop:20}]} onPress={()=>{setShowAuthModal(true); setIsRegistering(false);}}>
           <Text style={{color:THEME.textDark, fontWeight:'bold'}}>ACCESSO AGENTI</Text>
           <Ionicons name="briefcase-outline" size={20} color={THEME.textDark} style={{marginLeft:10}}/>
       </TouchableOpacity>

       <Modal visible={showAuthModal} transparent animationType="fade" onRequestClose={()=>setShowAuthModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
             <View style={styles.modalCard}>
                <View style={{alignItems:'center', marginBottom:20}}>
                    <BrandLogo scale={0.8}/>
                    <Text style={{fontSize:18, fontWeight:'bold', color:THEME.primary, marginTop:10}}>{isRegistering ? 'Nuovo Profilo Agente' : 'Login Portale Agenti'}</Text>
                </View>

                {isRegistering && (
                    <>
                        <View style={styles.inputContainer}>
                            <Ionicons name="person-outline" size={20} color="#999" style={{marginRight:10}}/>
                            <TextInput style={{flex:1, fontSize:16}} placeholder="Nome e Cognome" value={regName} onChangeText={setRegName}/>
                        </View>
                        <TouchableOpacity style={styles.inputContainer} onPress={()=>setShowRegDropdown(!showRegDropdown)}>
                            <Ionicons name="business-outline" size={20} color="#999" style={{marginRight:10}}/>
                            <Text style={{flex:1, fontSize:16, color: regCompany ? '#000':'#999'}}>{regCompany || "Azienda di Riferimento"}</Text>
                            <Ionicons name="chevron-down" size={20} color="#999"/>
                        </TouchableOpacity>
                        {showRegDropdown && ( 
                            <View style={styles.dropContainer}>
                                <ScrollView keyboardShouldPersistTaps="handled"> 
                                    {availableBrands.map(c => (<TouchableOpacity key={c} style={styles.dropItem} onPress={()=>{setRegCompany(c); setShowRegDropdown(false)}}><Text>{c}</Text></TouchableOpacity>))}
                                </ScrollView>
                            </View> 
                        )}
                    </>
                )}

                <View style={styles.inputContainer}>
                    <Ionicons name="mail-outline" size={20} color="#999" style={{marginRight:10}}/>
                    <TextInput style={{flex:1, fontSize:16}} placeholder="Email Aziendale" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail}/>
                </View>
                <View style={styles.inputContainer}>
                    <Ionicons name="lock-closed-outline" size={20} color="#999" style={{marginRight:10}}/>
                    <TextInput style={{flex:1, fontSize:16}} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword}/>
                </View>

                <TouchableOpacity style={[styles.btnBig, {marginTop:15}]} onPress={handleAuth} disabled={loadingAuth}>
                    {loadingAuth ? <ActivityIndicator color="#fff"/> : <Text style={styles.btnText}>{isRegistering ? 'INVIA' : 'ACCEDI'}</Text>}
                </TouchableOpacity>

                <View style={{flexDirection:'row', marginTop:20, gap:5}}>
                    <Text style={{color:'#666'}}>{isRegistering ? "Hai già le credenziali?" : "Non sei ancora registrato?"}</Text>
                    <TouchableOpacity onPress={()=>setIsRegistering(!isRegistering)}><Text style={{color:THEME.primary, fontWeight:'bold'}}>{isRegistering ? "Accedi" : "Crea Account"}</Text></TouchableOpacity>
                </View>
                
                <TouchableOpacity onPress={()=>setShowAuthModal(false)} style={{marginTop:15}}><Text style={{color:THEME.danger, fontSize:14}}>Chiudi</Text></TouchableOpacity>
             </View>
          </KeyboardAvoidingView>
       </Modal>
    </View>
  );

  // --- UI: IN ATTESA ---
  if(isPendingApproval) return (
      <View style={styles.center}>
          <Ionicons name="shield-checkmark-outline" size={80} color={THEME.warning} />
          <Text style={{fontSize:22, fontWeight:'bold', marginTop:20, color:THEME.textDark}}>REGISTRAZIONE RICEVUTA</Text>
          <Text style={{textAlign:'center', marginTop:10, paddingHorizontal:40, color:'#666', lineHeight:22}}>Il tuo account è stato creato. Attendi l'attivazione da parte dell'amministrazione.</Text>
          <TouchableOpacity style={[styles.btnBig, {marginTop:40, width:250}]} onPress={checkApprovalStatus} disabled={loadingAuth}>{loadingAuth ? <ActivityIndicator color="#fff"/> : <Text style={styles.btnText}>VERIFICA ORA</Text>}</TouchableOpacity>
          <TouchableOpacity style={[styles.btnOutline, {marginTop:15, width:250}]} onPress={handleLogout}><Text style={{color:THEME.textDark, fontWeight:'bold'}}>ESCI</Text></TouchableOpacity>
      </View>
  );

  // --- UI: DASHBOARD AGENTE ---
  if(userRole === 'AGENTE' && session) return (
    <SafeAreaView style={{flex:1, backgroundColor:THEME.bg}}>
       <View style={styles.header}>
           <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
               <BrandLogo/>
               <TouchableOpacity onPress={handleLogout}><Ionicons name="log-out-outline" size={24} color={THEME.danger}/></TouchableOpacity>
           </View>
           <Text style={{textAlign:'center', marginTop:5, color:'#666', fontSize:10}}>{session?.user?.user_metadata?.full_name?.toUpperCase()}</Text>
           <View style={{flexDirection:'row', marginTop:15, backgroundColor:'#eee', borderRadius:10, padding:2}}>
               <TouchableOpacity onPress={()=>setAgentTab('CODES')} style={[styles.tab, agentTab==='CODES' && styles.activeTab]}><Text style={[styles.tabText, agentTab==='CODES' && styles.activeTabText]}>SCONTI</Text></TouchableOpacity>
               <TouchableOpacity onPress={()=>setAgentTab('ALERTS')} style={[styles.tab, agentTab==='ALERTS' && styles.activeTab]}><Text style={[styles.tabText, agentTab==='ALERTS' && styles.activeTabText]}>AVVISI</Text></TouchableOpacity>
           </View>
       </View>
       <ScrollView contentContainerStyle={{padding:15}}>
           {agentTab === 'CODES' && (
               <>
                   <View style={[styles.cardForm, editingId && {borderWidth:2, borderColor:THEME.warning}]}>
                       <Text style={styles.sectionTitle}>{editingId ? "MODIFICA CODICE" : "NUOVO CODICE"}</Text>
                       <TextInput style={[styles.inputSmall, {borderColor:THEME.accent, color:THEME.accent, fontWeight:'bold', marginBottom:10}]} value={newCodeData.codice_sconto} onChangeText={t=>setNewCodeData({...newCodeData, codice_sconto:t})} autoCapitalize="characters" placeholder="CODICE (es: ROSSI2026)"/>
                       <TextInput style={[styles.inputSmall, {marginBottom:10}]} value={newCodeData.descrizione_interna} onChangeText={t=>setNewCodeData({...newCodeData, descrizione_interna:t})} placeholder="Descrizione (es. Cliente VIP)"/>
                       <View style={{flexDirection:'row', gap:5}}>
                           <TextInput style={[styles.inputDiscount, {flex:1}]} placeholder="Sem%" value={newCodeData.s_sementi} onChangeText={t=>setNewCodeData({...newCodeData, s_sementi:t})}/>
                           <TextInput style={[styles.inputDiscount, {flex:1}]} placeholder="Gran%" value={newCodeData.s_granulari} onChangeText={t=>setNewCodeData({...newCodeData, s_granulari:t})}/>
                           <TextInput style={[styles.inputDiscount, {flex:1}]} placeholder="Liq%" value={newCodeData.s_liquidi} onChangeText={t=>setNewCodeData({...newCodeData, s_liquidi:t})}/>
                       </View>
                       <TouchableOpacity style={[styles.btnBig, {marginTop:15, backgroundColor: editingId ? THEME.warning : THEME.textDark}]} onPress={saveOrUpdateCode}><Text style={styles.btnText}>{editingId ? "AGGIORNA" : "SALVA"}</Text></TouchableOpacity>
                       {editingId && <TouchableOpacity onPress={()=>{setEditingId(null); setNewCodeData({ descrizione_interna: '', codice_sconto: '', s_sementi: '', s_granulari: '', s_liquidi: '' })}} style={{alignSelf:'center', marginTop:10}}><Text style={{color:'red'}}>Annulla</Text></TouchableOpacity>}
                   </View>
                   <Text style={[styles.sectionTitle, {marginTop:20, marginLeft:5}]}>LISTA CODICI</Text>
                   <View style={styles.table}>
                       <View style={[styles.tableRow, {backgroundColor:THEME.tableHeader}]}>
                           <Text style={[styles.col, {flex:2, fontWeight:'bold'}]}>CODICE</Text>
                           <Text style={[styles.col, {flex:2, fontWeight:'bold'}]}>NOTE</Text>
                           <Text style={[styles.col, {flex:1, textAlign:'center'}]}>AZIONI</Text>
                       </View>
                       {agentCodes.map((item, idx) => (
                           <View key={idx} style={styles.tableRow}>
                               <TouchableOpacity style={{flex:2, padding:8}} onPress={()=>showCodeDetails(item)}><Text style={{color:THEME.accent, fontWeight:'bold', textDecorationLine:'underline'}}>{item.codice_sconto}</Text></TouchableOpacity>
                               <Text style={[styles.col, {flex:2, fontSize:11}]}>{item.descrizione_interna}</Text>
                               <View style={{flex:1, flexDirection:'row', justifyContent:'center'}}>
                                   <TouchableOpacity onPress={()=>startEditing(item)} style={{marginRight:8}}><Ionicons name="pencil" size={18} color={THEME.warning}/></TouchableOpacity>
                                   <TouchableOpacity onPress={()=>deleteCode(item.id)}><Ionicons name="trash" size={18} color={THEME.danger}/></TouchableOpacity>
                               </View>
                           </View>
                       ))}
                   </View>
               </>
           )}
           {agentTab === 'ALERTS' && (
               <>
                   <View style={styles.cardForm}>
                       <Text style={[styles.sectionTitle, {color:THEME.danger}]}>INVIA ALERT TECNICO</Text>
                       <TextInput style={[styles.inputSmall, {height:80, textAlignVertical:'top'}]} multiline placeholder="Scrivi il messaggio dettagliato per i clienti..." value={alertMessage} onChangeText={setAlertMessage}/>
                       <TouchableOpacity style={[styles.inputSmall, {marginTop:10, flexDirection:'row', justifyContent:'space-between'}]} onPress={()=>setShowProductPicker(true)}>
                           <Text style={{color: alertProducts.length>0 ? THEME.primary : '#999', fontWeight: alertProducts.length>0?'bold':'normal'}}>{alertProducts.length > 0 ? `${alertProducts.length} Prodotti Selezionati` : "Seleziona Prodotti Consigliati (Opz)"}</Text>
                           <Ionicons name="list" size={20} color="#666"/>
                       </TouchableOpacity>
                       <TouchableOpacity style={[styles.btnBig, {marginTop:15, backgroundColor:THEME.danger}]} onPress={sendAlert}><Ionicons name="megaphone-outline" size={20} color="#fff" style={{marginRight:5}}/><Text style={styles.btnText}>INVIA AI CLIENTI</Text></TouchableOpacity>
                   </View>
                   <Text style={[styles.sectionTitle, {marginTop:20, marginLeft:5}]}>STORICO AVVISI</Text>
                   {sentAlerts.map((alert, idx) => (
                       <View key={idx} style={{backgroundColor:'#fff', padding:15, borderRadius:10, marginBottom:10, borderLeftWidth:4, borderColor:THEME.danger, flexDirection:'row', justifyContent:'space-between'}}>
                           <View style={{flex:1}}><Text numberOfLines={2} style={{fontWeight:'bold', color:THEME.danger}}>{alert.message}</Text><Text style={{fontSize:10, color:'#999', marginTop:5}}>{new Date(alert.created_at).toLocaleDateString()}</Text></View>
                           <TouchableOpacity onPress={()=>deleteAlert(alert.id)}><Ionicons name="trash" size={20} color="#999"/></TouchableOpacity>
                       </View>
                   ))}
                   <Modal visible={showProductPicker} animationType="slide">
                       <SafeAreaView style={{flex:1}}>
                           <View style={{padding:20, borderBottomWidth:1, borderColor:'#eee', flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                               <Text style={{fontWeight:'bold', fontSize:18}}>Seleziona Prodotti</Text>
                               <TouchableOpacity onPress={()=>setShowProductPicker(false)}><Text style={{color:THEME.primary, fontWeight:'bold'}}>FATTO</Text></TouchableOpacity>
                           </View>
                           <FlatList data={productsDB.filter(p => p.marca.toUpperCase() === session?.user?.user_metadata?.company.toUpperCase())} keyExtractor={i=>i.id.toString()} renderItem={({item}) => {
                                   const isSelected = alertProducts.some(p => p.id === item.id);
                                   return ( <TouchableOpacity style={{padding:15, borderBottomWidth:1, borderColor:'#eee', backgroundColor: isSelected ? '#E8F5E9' : '#fff', flexDirection:'row', justifyContent:'space-between', alignItems:'center'}} onPress={()=>toggleAlertProduct(item)}>
                                            <View><Text style={{fontWeight:'bold'}}>{item.nome}</Text><Text style={{fontSize:12, color:'#666'}}>{item.categoria}</Text></View>
                                            {isSelected && <Ionicons name="checkmark-circle" size={24} color={THEME.accent}/>}
                                   </TouchableOpacity> );
                           }}/>
                       </SafeAreaView>
                   </Modal>
               </>
           )}
       </ScrollView>
    </SafeAreaView>
  );

  // --- UI: SHOP CLIENTI ---
  return (
    <SafeAreaView style={{flex:1, backgroundColor:THEME.bg, paddingTop: Platform.OS==='android'?StatusBar.currentHeight:0}}>
      <StatusBar barStyle="dark-content"/>
      {/* BANNER ALERT */}
      {clientAlerts.length > 0 && (
          <TouchableOpacity activeOpacity={0.9} onPress={()=>setSelectedAlert(clientAlerts[0])} style={{backgroundColor:THEME.danger, padding:12, marginBottom:1, flexDirection:'row', alignItems:'center', justifyContent:'center'}}>
              <Ionicons name="warning" size={24} color="#fff" style={{marginRight:10}}/>
              <View style={{flex:1}}>
                  <Text style={{color:'#fff', fontWeight:'bold', fontSize:11, textTransform:'uppercase'}}>AVVISO {clientAlerts[0].company}</Text>
                  <Text numberOfLines={2} style={{color:'#fff', fontSize:13}}>{clientAlerts[0].message}</Text>
                  <Text style={{color:'#FFF', fontSize:10, marginTop:4, textDecorationLine:'underline', fontWeight:'bold'}}>LEGGI AVVISO COMPLETO ➔</Text>
              </View>
          </TouchableOpacity>
      )}

      {/* MODAL ALERT */}
      <Modal visible={selectedAlert !== null} animationType="fade" transparent>
          <View style={styles.modalOverlay}>
              <View style={styles.modalCard}>
                  <View style={{alignItems:'center', marginBottom:15}}>
                      <Ionicons name="megaphone" size={40} color={THEME.danger} />
                      <Text style={{fontSize:18, fontWeight:'900', color:THEME.danger, marginTop:10}}>AVVISO TECNICO</Text>
                      <Text style={{fontSize:12, color:'#666'}}>{selectedAlert?.company} - {new Date(selectedAlert?.created_at).toLocaleDateString()}</Text>
                  </View>
                  <ScrollView style={{maxHeight: 300, width:'100%', marginBottom:20}}>
                      <Text style={{fontSize:16, lineHeight:24, color:'#333', textAlign:'justify'}}>{selectedAlert?.message}</Text>
                      {selectedAlert?.product_name && (
                          <View style={{marginTop:20, backgroundColor:'#FBE9E7', padding:10, borderRadius:8}}>
                              <Text style={{fontWeight:'bold', color:THEME.danger, fontSize:12}}>PRODOTTI CONSIGLIATI:</Text>
                              <Text style={{color:THEME.textDark, fontWeight:'bold'}}>{selectedAlert.product_name}</Text>
                          </View>
                      )}
                  </ScrollView>
                  <View style={{width:'100%', gap:10}}>
                      <TouchableOpacity style={[styles.btnBig, {backgroundColor:THEME.primary}]} onPress={handleDismissAlert}><Text style={styles.btnText}>HO CAPITO (ARCHIVIA)</Text></TouchableOpacity>
                      <TouchableOpacity style={[styles.btnOutline, {borderColor:'#999'}]} onPress={handlePostponeAlert}><Text style={{color:'#666', fontWeight:'bold'}}>RICORDAMELO DOPO</Text></TouchableOpacity>
                  </View>
              </View>
          </View>
      </Modal>

      <View style={styles.header}>
         <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:15}}>
             <TouchableOpacity onPress={()=>setUserRole(null)}><Ionicons name="arrow-back" size={26} color={THEME.textDark}/></TouchableOpacity>
             <BrandLogo/>
             <View style={{width:26}}/>
         </View>
         <View style={[styles.searchBox, {marginBottom: 10}]}>
             <Ionicons name="key" size={20} color="#999"/>
             <TextInput style={[styles.searchInput]} placeholder="Aggiungi Codice Listino..." value={inputCodicePartner} onChangeText={setInputCodicePartner}/>
             <TouchableOpacity onPress={validaCodice}><Ionicons name="add-circle" size={30} color={THEME.accent}/></TouchableOpacity>
         </View>
         {activePartners.length > 0 && (
             <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:10, maxHeight:40}}>
                 {activePartners.map((partner, idx) => (
                     <TouchableOpacity key={idx} onPress={()=>removePartner(partner.codice_sconto)} style={{flexDirection:'row', alignItems:'center', backgroundColor:THEME.primary, paddingHorizontal:10, paddingVertical:5, borderRadius:20, marginRight:8}}>
                         <Text style={{color:'#fff', fontSize:11, fontWeight:'bold'}}>{partner.azienda} - {partner.nome_agente}</Text>
                         <Ionicons name="close-circle" size={16} color="#fff" style={{marginLeft:5}}/>
                     </TouchableOpacity>
                 ))}
             </ScrollView>
         )}
         <View style={styles.searchBox}>
             <Ionicons name="search" size={20} color="#666"/>
             <TextInput style={styles.searchInput} placeholder="Cerca prodotto..." value={search} onChangeText={setSearch}/>
         </View>
         
         <View style={{marginTop:15}}>
             <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                 {activePartners.length > 0 
                    ? [...new Set(activePartners.map(p => p.azienda))].map(b => (
                        <TouchableOpacity key={b} onPress={()=>setSelectedBrand(b?b.toUpperCase():'TUTTI')} style={[styles.chip, selectedBrand===(b?b.toUpperCase():'TUTTI') && {backgroundColor:THEME.textDark}]}>
                           <Text style={[styles.chipText, selectedBrand===(b?b.toUpperCase():'TUTTI') && {color:'#fff'}]}>{b}</Text>
                        </TouchableOpacity>
                      ))
                    : ['TUTTI', ...new Set(productsDB.map(i=>i.marca).filter(x=>x))].map(b => (
                        <TouchableOpacity key={b} onPress={()=>setSelectedBrand(b?b.toUpperCase():'TUTTI')} style={[styles.chip, selectedBrand===(b?b.toUpperCase():'TUTTI') && {backgroundColor:THEME.textDark}]}>
                           <Text style={[styles.chipText, selectedBrand===(b?b.toUpperCase():'TUTTI') && {color:'#fff'}]}>{b}</Text>
                        </TouchableOpacity>
                      ))
                 }
                 {activePartners.length > 1 && (
                    <TouchableOpacity onPress={()=>setSelectedBrand('TUTTI')} style={[styles.chip, selectedBrand==='TUTTI' && {backgroundColor:THEME.textDark}]}>
                       <Text style={[styles.chipText, selectedBrand==='TUTTI' && {color:'#fff'}]}>TUTTI I MIEI LISTINI</Text>
                    </TouchableOpacity>
                 )}
             </ScrollView>
         </View>

         <View style={{marginTop:10}}>
             <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                 {['TUTTI', ...new Set(productsDB.map(i=>i.categoria).filter(x=>x))].map(c => (
                    <TouchableOpacity key={c} onPress={()=>setSelectedCategory(c?c.toUpperCase():'TUTTI')} style={[styles.chipSmall, selectedCategory===(c?c.toUpperCase():'TUTTI') && {backgroundColor:THEME.accent, borderColor:THEME.accent}]}>
                       <Text style={[styles.chipTextSmall, selectedCategory===(c?c.toUpperCase():'TUTTI') && {color:'#fff'}]}>{c}</Text>
                    </TouchableOpacity>
                 ))}
             </ScrollView>
         </View>
      </View>
      <FlatList 
         data={productsDB
             .filter(p => {
                 const allowedBrands = activePartners.map(ap => ap.azienda.toUpperCase());
                 if (allowedBrands.length > 0 && !allowedBrands.includes(p.marca.toUpperCase())) return false;
                 // Controllo ricerca con funzione getSearchScore (count > 0)
                 if (search && getSearchScore(p, search).count === 0) return false;
                 if (selectedBrand !== 'TUTTI' && p.marca.toUpperCase() !== selectedBrand.toUpperCase()) return false;
                 if (selectedCategory !== 'TUTTI' && p.categoria.toUpperCase() !== selectedCategory) return false;
                 return true;
             })
             .sort((a, b) => {
                 if (!search) return 0;
                 const scoreA = getSearchScore(a, search);
                 const scoreB = getSearchScore(b, search);
                 // 1. Ordina per quantità estratta (Desc)
                 if (scoreA.qty !== scoreB.qty) return scoreB.qty - scoreA.qty;
                 // 2. Ordina per frequenza parola (Desc)
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

             return (
               <View style={[styles.card, {borderColor: item.colore || '#eee', borderWidth: 2}, (inCart || inMix) && {backgroundColor:'#f9f9f9'}]}>
                   <TouchableOpacity style={styles.cardLeft} onPress={()=>toggleFavorite(item.id)}><Ionicons name={isFav?"heart":"heart-outline"} size={26} color={isFav?THEME.danger:THEME.iconInactive}/></TouchableOpacity>
                   <TouchableOpacity style={styles.cardCenter} onPress={()=>{setSelectedProduct(item); }}>
                       {/* Evidenziazione Ricerca */}
                       <HighlightText baseStyle={styles.cardBrand} text={item.marca} term={search} />
                       <HighlightText baseStyle={styles.cardTitle} text={item.nome} term={search} />
                       <HighlightText baseStyle={styles.cardSub} text={item.categoria} term={search} />
                   </TouchableOpacity>
                   <View style={styles.cardRight}>
                       {hasAccess ? (
                           <>
                               <TouchableOpacity onPress={() => toggleMix(item)} style={{marginBottom:15}}>
                                  <View style={{backgroundColor:inMix?THEME.primary:'#fff', padding:8, borderRadius:8, borderWidth:1, borderColor:inMix?THEME.primary:THEME.secondary}}><Ionicons name={inMix?"flask":"flask-outline"} size={22} color={inMix?"#fff":THEME.iconInactive}/></View>
                               </TouchableOpacity>
                               <TouchableOpacity onPress={() => toggleCart(item)}>
                                  <View style={{backgroundColor:inCart?THEME.accent:'#fff', padding:8, borderRadius:8, borderWidth:1, borderColor:inCart?THEME.accent:THEME.secondary}}><Ionicons name={inCart?"cart":"cart-outline"} size={22} color={inCart?"#fff":THEME.iconInactive}/></View>
                               </TouchableOpacity>
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
      <View style={{position:'absolute', bottom:30, right:20, flexDirection:'row', gap:15}}>
         {mixItems.length > 0 && (<TouchableOpacity style={[styles.fab, {backgroundColor:THEME.primary}]} onPress={()=>setShowMixListModal(true)}><Ionicons name="flask" size={24} color="#fff"/><Text style={styles.fabText}>MIX ({mixItems.length})</Text></TouchableOpacity>)}
         {cartItems.length > 0 && (<TouchableOpacity style={[styles.fab, {backgroundColor:THEME.accent}]} onPress={()=>setShowCartModal(true)}><Ionicons name="cart" size={24} color="#fff"/><Text style={styles.fabText}>ORDINE ({cartItems.length})</Text></TouchableOpacity>)}
      </View>
      
      {/* --- NEW DETAIL MODAL --- */}
      <Modal visible={selectedProduct!==null} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setSelectedProduct(null)}>
        {selectedProduct && (
            <View style={{flex:1, backgroundColor:'#fff'}}>
                {/* Custom Green Header */}
                <View style={{backgroundColor:'#C8E6C9', padding:20, paddingTop:Platform.OS==='android'?40:20, paddingBottom:30}}>
                     <TouchableOpacity onPress={()=>setSelectedProduct(null)} style={{alignSelf:'flex-start', marginBottom:15}}>
                         <Ionicons name="close" size={30} color={THEME.textDark}/>
                     </TouchableOpacity>
                     <Text style={{fontSize:32, fontWeight:'bold', color:THEME.textDark}}>{selectedProduct.nome}</Text>
                     <Text style={{fontSize:14, fontWeight:'bold', color:THEME.info, marginTop:5, textTransform:'uppercase'}}>
                         {selectedProduct.marca} • {selectedProduct.categoria}
                     </Text>
                </View>

                <ScrollView contentContainerStyle={{padding:20}}>
                     {/* DOSE CARDS */}
                     <View style={{flexDirection:'row', gap:15, marginBottom:20}}>
                         <View style={styles.newDoseCard}>
                             <Ionicons name="arrow-down-circle" size={20} color="#8D6E63"/>
                             <Text style={{fontSize:10, fontWeight:'bold', color:'#666', marginTop:5}}>DOSE RADICALE</Text>
                             <Text style={{fontSize:18, fontWeight:'bold', color:THEME.textDark}}>
                                {selectedProduct.dose_radicale > 0 ? `${selectedProduct.dose_radicale} g/m²` : '-'}
                             </Text>
                         </View>
                         <View style={styles.newDoseCard}>
                             <Ionicons name="leaf" size={20} color={THEME.textDark}/>
                             <Text style={{fontSize:10, fontWeight:'bold', color:'#666', marginTop:5}}>DOSE FOGLIARE</Text>
                             <Text style={{fontSize:18, fontWeight:'bold', color:THEME.textDark}}>
                                {selectedProduct.dose_fogliare > 0 ? `${selectedProduct.dose_fogliare} ml/m²` : '-'}
                             </Text>
                         </View>
                     </View>

                     {/* PERIOD CARD */}
                     <View style={styles.newPeriodCard}>
                         <View style={{marginRight:15}}><Ionicons name="calendar" size={30} color="#5E35B1"/></View>
                         <View style={{flex:1}}>
                             <Text style={{fontSize:10, color:'#5E35B1', fontWeight:'bold', marginBottom:2}}>PERIODO INDICATO</Text>
                             <Text style={{color:'#333', fontSize:14, fontWeight:'500'}}>{selectedProduct.periodo_uso || "Tutto l'anno"}</Text>
                         </View>
                     </View>

                     {/* DESCRIZIONE */}
                     <Text style={{fontSize:12, color:'#999', marginTop:15, marginBottom:5}}>DESCRIZIONE TECNICA</Text>
                     <Text style={{fontSize:16, color:'#333', lineHeight:24}}>{selectedProduct.descrizione}</Text>

                     {/* COMPOSIZIONE */}
                     <Text style={{fontSize:12, color:'#999', marginTop:20, marginBottom:5}}>COMPOSIZIONE CHIMICA</Text>
                     <View style={{backgroundColor:'#F5F5F5', padding:15, borderRadius:10, borderWidth:1, borderColor:'#eee'}}>
                         <Text style={{color:'#444', fontStyle:'italic'}}>{selectedProduct.composizione || "Non specificata"}</Text>
                     </View>

                     {/* CALCULATOR BEIGE BOX */}
                     <View style={styles.newCalcBox}>
                         <Text style={{textAlign:'center', fontWeight:'bold', color:THEME.textDark, fontSize:12, marginBottom:15}}>MQ DA TRATTARE</Text>
                         
                         <TextInput 
                            style={styles.newCalcInput} 
                            placeholder="0" 
                            keyboardType="numeric" 
                            value={lawnSize} 
                            onChangeText={updateLawnSize} 
                         />

                         {lawnSize ? (
                             <>
                                {(() => {
                                    const specs = calcSpecs(selectedProduct, lawnSize);
                                    return (
                                        <View>
                                            {/* Se ha dose radicale */}
                                            {specs.qRad > 0 && (
                                                <View style={{alignItems:'center', marginBottom:10}}>
                                                    <Text style={{fontSize:12, color:'#8D6E63', fontWeight:'bold'}}>RADICALE</Text>
                                                    <Text style={[styles.newCalcResult, {color:'#8D6E63'}]}>{specs.qRad.toFixed(2)} {specs.unit}</Text>
                                                </View>
                                            )}
                                            {/* Se ha dose fogliare */}
                                            {specs.qFog > 0 && (
                                                <View style={{alignItems:'center'}}>
                                                    <Text style={{fontSize:12, color:THEME.textDark, fontWeight:'bold'}}>FOGLIARE</Text>
                                                    <Text style={styles.newCalcResult}>{specs.qFog.toFixed(2)} {specs.unit}</Text>
                                                </View>
                                            )}
                                        </View>
                                    )
                                })()}
                                
                                <Text style={{textAlign:'center', fontSize:10, color:'#777', marginTop:15}}>
                                    * Calcolo universale in Kg (Solidi) o ml (Liquidi)
                                </Text>
                             </>
                         ) : (
                            <Text style={{textAlign:'center', fontSize:32, color:'#ccc', marginVertical:20}}>- {selectedProduct.unita_misura === 'L' || selectedProduct.unita_misura === 'ML' ? 'ml' : 'Kg'}</Text>
                         )}
                     </View>
                </ScrollView>
            </View>
        )}
      </Modal>

      {/* Modal Carrello e Mix */}
      <Modal visible={showMixListModal} animationType="slide">
         <SafeAreaView style={{flex:1, backgroundColor:'#fff'}}>
             <View style={{flex:1, padding:20}}>
                <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:20}}>
                   <Text style={[styles.modalTitle, {color:THEME.primary}]}>Trattamento Tecnico</Text>
                   <TouchableOpacity onPress={()=>setShowMixListModal(false)}><Ionicons name="close" size={30}/></TouchableOpacity>
                </View>

                {/* --- WARNING MIX LOGIC --- */}
                {(() => {
                     const hasRadicalOnly = mixItems.some(i => parseFloat(i.dose_radicale) > 0 && parseFloat(i.dose_fogliare) === 0);
                     const hasFoliarOnly = mixItems.some(i => parseFloat(i.dose_fogliare) > 0 && parseFloat(i.dose_radicale) === 0);
                     if (hasRadicalOnly && hasFoliarOnly) {
                         return (
                             <View style={{backgroundColor:'#FFEBEE', padding:10, borderRadius:8, marginBottom:15, flexDirection:'row', alignItems:'center'}}>
                                 <Ionicons name="warning" size={24} color={THEME.danger} style={{marginRight:10}}/>
                                 <Text style={{color:THEME.danger, fontSize:12, flex:1, fontWeight:'bold'}}>ATTENZIONE: Stai mischiando prodotti esclusivamente radicali con prodotti esclusivamente fogliari!</Text>
                             </View>
                         )
                     }
                     return null;
                })()}

                <View style={{backgroundColor:THEME.secondary, padding:15, borderRadius:10, marginBottom:20}}>
                   <Text style={{fontSize:12, fontWeight:'bold', color:THEME.primary}}>AREA TOTALE (MQ)</Text>
                   <TextInput style={styles.mqInput} placeholder="0" keyboardType="numeric" value={lawnSize} onChangeText={updateLawnSize}/>
                </View>
                <ScrollView>
                   {mixItems.map((p, idx) => {
                       const specs = calcSpecs(p, lawnSize);
                       return (
                          <View key={idx} style={styles.cartItem}>
                             <View style={{flex:1}}>
                                <Text style={{fontWeight:'bold', color:THEME.primary}}>{p.nome}</Text>
                                <View style={{marginTop:5}}>
                                    {/* Mostra entrambe le opzioni se disponibili */}
                                    {specs.qRad > 0 && (
                                        <View style={{flexDirection:'row', alignItems:'center', marginBottom:2}}>
                                            <View style={{backgroundColor:'#FFF3E0', paddingHorizontal:6, paddingVertical:2, borderRadius:4, marginRight:5}}><Text style={{fontSize:10, color:'#5D4037'}}>RAD</Text></View>
                                            {lawnSize ? <Text style={{fontWeight:'bold', color:'#333'}}>{specs.qRad.toFixed(2)} {specs.unit}</Text> : <Text style={{color:'#999'}}>-</Text>}
                                        </View>
                                    )}
                                    {specs.qFog > 0 && (
                                        <View style={{flexDirection:'row', alignItems:'center'}}>
                                            <View style={{backgroundColor:'#E8F5E9', paddingHorizontal:6, paddingVertical:2, borderRadius:4, marginRight:5}}><Text style={{fontSize:10, color:'#1B5E20'}}>FOG</Text></View>
                                            {lawnSize ? <Text style={{fontWeight:'bold', color:'#333'}}>{specs.qFog.toFixed(2)} {specs.unit}</Text> : <Text style={{color:'#999'}}>-</Text>}
                                        </View>
                                    )}
                                </View>
                             </View>
                             <View style={{alignItems:'flex-end'}}>
                                 <TouchableOpacity onPress={()=>toggleMix(p)} style={{marginTop:5}}><Ionicons name="trash-outline" size={20} color={THEME.danger}/></TouchableOpacity>
                             </View>
                          </View>
                       )
                   })}
                </ScrollView>
             </View>
         </SafeAreaView>
      </Modal>
      <Modal visible={showCartModal} animationType="slide">
         <SafeAreaView style={{flex:1, backgroundColor:'#fff'}}>
             <View style={{flex:1, padding:20}}>
                <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:20, alignItems:'center'}}>
                   <Text style={[styles.modalTitle, {color:THEME.accent}]}>Preventivo Vendita</Text>
                   <TouchableOpacity onPress={()=>setShowCartModal(false)}><Ionicons name="close" size={30}/></TouchableOpacity>
                </View>
                <ScrollView>
                   {cartItems.map((p, idx) => {
                       const price = applyDisc(parseFloat(p.prezzo)||0, getDiscount(p));
                       const qty = parseFloat(p.quantity)||0;
                       
                       // Determine unit string for display (Kg or L)
                       const isLiquid = ['ML','L','LT'].includes((p.unita_misura||'').toUpperCase());
                       const displayUnit = isLiquid ? 'L' : 'Kg';

                       return (
                          <View key={idx} style={styles.cartItem}>
                             <View style={{flex:1}}>
                                <Text style={{fontWeight:'bold', color:THEME.textDark, fontSize:16}}>{p.nome}</Text>
                                <Text style={{fontSize:12, color:THEME.primary}}>€ {price.toFixed(2)} / {p.unita_misura}</Text>
                             </View>
                             <View style={{alignItems:'flex-end'}}>
                                <View style={{flexDirection:'row', alignItems:'center', backgroundColor:THEME.secondary, borderRadius:8}}>
                                   <TextInput style={styles.qtyInput} placeholder="0" keyboardType="numeric" value={p.quantity} onChangeText={(t)=>updateCartQuantity(p.id, t)}/>
                                   <Text style={{paddingRight:10, fontSize:12, fontWeight:'bold', color:'#666'}}>{displayUnit}</Text>
                                </View>
                                <Text style={{fontWeight:'bold', marginTop:5, fontSize:16}}>€ {(qty * price).toFixed(2)}</Text>
                                <TouchableOpacity onPress={()=>toggleCart(p)} style={{marginTop:5}}><Text style={{color:THEME.danger, fontSize:10}}>Rimuovi</Text></TouchableOpacity>
                             </View>
                          </View>
                       );
                   })}
                </ScrollView>
                <View style={{borderTopWidth:1, borderColor:'#eee', paddingTop:20}}>
                   <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:15}}>
                      <Text style={{fontSize:18, color:'#666'}}>Totale:</Text>
                      <Text style={{fontSize:28, fontWeight:'bold', color:THEME.accent}}>€ {calculateCartTotal().toFixed(2)}</Text>
                   </View>
                   <TouchableOpacity style={styles.btnBig} onPress={printPDF}><Ionicons name="print-outline" size={24} color="#fff" style={{marginRight:10}}/><Text style={styles.btnText}>STAMPA PDF</Text></TouchableOpacity>
                </View>
             </View>
         </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex:1, justifyContent:'center', alignItems:'center', backgroundColor:'#fff', padding:20 },
  header: { backgroundColor:'#fff', padding:20, paddingTop:Platform.OS==='android'?40:20, borderBottomWidth:1, borderColor:'#eee' },
  card: { flexDirection:'row', backgroundColor:'#fff', borderRadius:16, marginBottom:12, padding:15, alignItems:'center', shadowColor:'#000', shadowOpacity:0.05, shadowRadius:8, elevation:3 },
  cardLeft: { paddingRight:15, borderRightWidth:1, borderColor:'#f5f5f5', justifyContent:'center' },
  cardCenter: { flex:1, paddingHorizontal:15 },
  cardRight: { paddingLeft:10, alignItems:'center', justifyContent:'center' },
  cardBrand: { fontSize:10, fontWeight:'bold', color:'#999', textTransform:'uppercase' },
  cardTitle: { fontSize:16, fontWeight:'bold', color:THEME.textDark, marginVertical:2 },
  cardSub: { fontSize:11, color:'#555' },
  searchBox: { flexDirection:'row', alignItems:'center', backgroundColor:THEME.secondary, borderRadius:12, paddingHorizontal:15, height:48 },
  searchInput: { flex:1, marginLeft:10, fontSize:16 },
  mqInputSmall: { fontSize:24, fontWeight:'bold', textAlign:'center', borderBottomWidth:2, borderColor:THEME.accent, width:'60%', alignSelf:'center', padding:5 },
  mqInput: { fontSize:28, fontWeight:'bold', textAlign:'center', borderBottomWidth:1, borderColor:THEME.primary },
  qtyInput: { width:50, textAlign:'center', padding:10, fontWeight:'bold', fontSize:16 },
  chip: { paddingHorizontal:16, paddingVertical:8, borderRadius:20, backgroundColor:'#f0f0f0', marginRight:8 },
  chipText: { fontSize:12, fontWeight:'600' },
  chipSmall: { paddingHorizontal:12, paddingVertical:6, borderRadius:15, borderWidth:1, borderColor:'#eee', marginRight:6 },
  chipTextSmall: { fontSize:11, fontWeight:'600', color:'#555' },
  btnBig: { backgroundColor:THEME.accent, padding:18, borderRadius:16, alignItems:'center', width:'100%', flexDirection:'row', justifyContent:'center' },
  btnOutline: { borderWidth:1, borderColor:THEME.textDark, padding:16, borderRadius:12, width:'100%', alignItems:'center' },
  btnText: { color:'#fff', fontWeight:'bold', fontSize:16 },
  fab: { paddingHorizontal:20, paddingVertical:12, borderRadius:30, flexDirection:'row', alignItems:'center', elevation:8, shadowColor:'#000', shadowOpacity:0.3, shadowOffset:{width:0,height:4} },
  fabText: { color:'#fff', fontWeight:'bold', marginLeft:5, fontSize:12 },
  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', padding:30 },
  modalCard: { backgroundColor:'#fff', padding:30, borderRadius:20, alignItems:'center', width:'90%' },
  modalTitle: { fontSize:24, fontWeight:'bold', color:THEME.textDark, marginBottom:10 },
  cartItem: { flexDirection:'row', alignItems:'center', paddingVertical:15, borderBottomWidth:1, borderColor:'#f0f0f0' },
  
  // NEW LOGIN STYLES (PROFESSIONAL CLEAN)
  inputContainer: { flexDirection:'row', alignItems:'center', backgroundColor:'#F5F7FA', borderWidth:1, borderColor:'#E0E0E0', borderRadius:12, paddingHorizontal:15, paddingVertical:12, width:'100%', marginBottom:15 },
  dropContainer: { width:'100%', maxHeight:150, borderWidth:1, borderColor:'#E0E0E0', borderRadius:12, marginBottom:15, backgroundColor:'#fff', elevation: 5, zIndex: 1000 },
  dropItem: { padding:15, borderBottomWidth:1, borderColor:'#f0f0f0' },

  // DASHBOARD STYLES
  cardForm: { backgroundColor:'#fff', padding:20, borderRadius:15, shadowColor:'#000', shadowOpacity:0.05, shadowRadius:10, elevation:3 },
  sectionTitle: { fontSize:16, fontWeight:'900', color:THEME.primary, marginBottom:15 },
  label: { fontSize:12, fontWeight:'bold', color:'#666', marginBottom:5, marginTop:10 },
  inputSmall: { backgroundColor:'#F5F7FA', padding:10, borderRadius:8, borderWidth:1, borderColor:'#E0E0E0' },
  inputDiscount: { backgroundColor:'#FFFDE7', padding:10, borderRadius:8, borderWidth:1, borderColor:'#FFEB3B', textAlign:'center', fontWeight:'bold' },
  table: { marginTop:10, backgroundColor:'#fff', borderRadius:10, overflow:'hidden', borderWidth:1, borderColor:'#eee' },
  tableRow: { flexDirection:'row', borderBottomWidth:1, borderColor:'#eee', alignItems:'center' },
  col: { padding:10, fontSize:13, color:'#333' },
  
  // TAB STYLE
  tab: { flex:1, alignItems:'center', padding:10, borderRadius:8 },
  activeTab: { backgroundColor:'#fff', shadowColor:'#000', shadowOpacity:0.1, shadowRadius:2, elevation:2 },
  tabText: { fontWeight:'bold', color:'#999' },
  activeTabText: { color:THEME.primary },

  // --- NEW STYLES FOR THE "ALWAYS" LAYOUT ---
  newDoseCard: { flex:1, backgroundColor:'#F5F5F5', borderRadius:12, padding:15, alignItems:'center', justifyContent:'center' },
  newPeriodCard: { flexDirection:'row', alignItems:'center', backgroundColor:'#EDE7F6', borderColor:'#7E57C2', borderWidth:1, borderRadius:12, padding:15, marginTop:0 },
  newCalcBox: { backgroundColor:'#F9FBE7', padding:30, borderRadius:20, marginTop:30, alignItems:'center' },
  newCalcInput: { backgroundColor:'#fff', width:'80%', fontSize:24, fontWeight:'bold', textAlign:'center', padding:15, borderRadius:10, elevation:2, marginBottom:20 },
  newCalcResult: { fontSize:48, fontWeight:'bold', color:'#5E35B1' }
});