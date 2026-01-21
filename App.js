import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform, SafeAreaView,
  ScrollView, StatusBar,
  StyleSheet,
  Text, TextInput,
  TouchableOpacity,
  View
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
  secondary: '#ECEFF1', iconInactive: '#B0BEC5', tableHeader: '#E0E0E0'
};

const BrandLogo = () => (
  <View style={{alignItems:'center'}}>
    <Text style={{fontSize:24, fontWeight:'900', color:THEME.textDark}}>AgriManager</Text>
    <Text style={{fontSize:10, color:THEME.accent, fontWeight:'bold', letterSpacing:1}}>powered by SINELICA</Text>
  </View>
);

export default function App() {
  const [appIsReady, setAppIsReady] = useState(false);
  const [userRole, setUserRole] = useState(null); 
  const [session, setSession] = useState(null);
  
  // STATO PER APPROVAZIONE PENDENTE
  const [isPendingApproval, setIsPendingApproval] = useState(false);

  // --- AUTH ---
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regCompany, setRegCompany] = useState('');
  const [showRegDropdown, setShowRegDropdown] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [availableBrands, setAvailableBrands] = useState([]);

  // --- DATI SHOP ---
  const [productsDB, setProductsDB] = useState([]);
  const [filteredDataSource, setFilteredDataSource] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('TUTTI'); 
  const [selectedCategory, setSelectedCategory] = useState('TUTTI');
  const [cartItems, setCartItems] = useState([]); 
  const [showCartModal, setShowCartModal] = useState(false);
  const [mixItems, setMixItems] = useState([]); 
  const [showMixListModal, setShowMixListModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null); 
  const [detailMode, setDetailMode] = useState('RADICALE'); 
  const [lawnSize, setLawnSize] = useState(''); 
  const [favorites, setFavorites] = useState([]);
  const [inputCodicePartner, setInputCodicePartner] = useState('');
  const [activePartners, setActivePartners] = useState([]); 
  
  // --- ALERT SYSTEM ---
  const [clientAlerts, setClientAlerts] = useState([]);
  const [dismissCount, setDismissCount] = useState(0);

  // --- DASHBOARD AGENTE ---
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
      loadCommonData().then(() => {
          if(session) initAppAgente(session); 
          else initAppCliente();
      });
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if(session) { 
          initAppAgente(session);
      } else { 
          setUserRole(null); setAgentCodes([]); setSentAlerts([]); setIsPendingApproval(false);
      }
    });
  }, []);

  const loadCommonData = async () => {
      const { data } = await supabase.from('Prodotti').select('*').order('marca').order('nome');
      if(data) {
          setProductsDB(data);
          setFilteredDataSource(data);
          const brands = [...new Set(data.map(p => p.marca).filter(m => m))];
          setAvailableBrands(brands);
          if(brands.length > 0) setRegCompany(brands[0]);
      }
  };

  useEffect(() => {
    let interval;
    if (activePartners.length > 0 && dismissCount < 3) {
        refreshAllAlerts();
        interval = setInterval(() => {
            if (dismissCount < 3) refreshAllAlerts();
        }, 60000); 
    } else {
        setClientAlerts([]); 
    }
    return () => clearInterval(interval);
  }, [activePartners, dismissCount]);

  const refreshAllAlerts = async () => {
      const emails = activePartners.map(p => p.email);
      if(emails.length === 0) return;
      const { data } = await supabase.from('alerts').select('*').in('agent_email', emails).order('created_at', {ascending: false});
      if(data && data.length > 0) setClientAlerts(data);
  };

  const handleCloseAlert = () => { setClientAlerts([]); setDismissCount(prev => prev + 1); };

  const initAppCliente = async () => {
    try {
      const favs = await AsyncStorage.getItem('FAVS');
      if(favs) setFavorites(JSON.parse(favs));
    } catch (e) {} finally { setAppIsReady(true); }
  };

  const initAppAgente = async (currentSession) => {
     if(currentSession?.user?.email) {
         const { data: agentData } = await supabase
            .from('agenti')
            .select('approvato')
            .eq('email', currentSession.user.email)
            .single();

         if (!agentData || agentData.approvato === false) {
             setIsPendingApproval(true);
             setUserRole(null);
             setShowAuthModal(false);
         } else {
             setIsPendingApproval(false);
             setUserRole('AGENTE');
             setShowAuthModal(false);
             fetchAgentCodes(currentSession.user.email);
             fetchAgentAlerts(currentSession.user.email);
         }
     }
     setAppIsReady(true);
  };

  const checkApprovalStatus = async () => {
      setLoadingAuth(true);
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      setSession(freshSession);
      await initAppAgente(freshSession);
      setLoadingAuth(false);
      
      if(isPendingApproval) Alert.alert("Ancora in attesa", "L'amministrazione non ha ancora attivato il tuo account.");
      else Alert.alert("Account Attivo!", "Benvenuto in AgriManager.");
  };

  const handleAuth = async () => {
    setLoadingAuth(true);
    let error = null;
    
    if (isRegistering) {
        if(!regName || !regCompany) { Alert.alert("Mancano dati", "Inserisci Nome e Azienda."); setLoadingAuth(false); return; }
        
        const res = await supabase.auth.signUp({ 
            email, 
            password, 
            options: { data: { full_name: regName, company: regCompany } } 
        });
        error = res.error;

        if (error && error.message.includes('already registered')) {
             Alert.alert("Errore", "Questa email è già registrata. Accedi invece di registrarti.");
             setLoadingAuth(false);
             return;
        }

        if (!error && res.data.user) {
            const { error: dbError } = await supabase.from('agenti').insert({
                nome_agente: regName,
                email: email,
                azienda: regCompany,
                approvato: false 
            });

            if (dbError) {
                Alert.alert("Errore Database", dbError.message);
            } else {
                Alert.alert("Registrazione Inviata", "Attendi l'attivazione dell'account.");
                setIsRegistering(false);
                setIsPendingApproval(true);
            }
        }
    } else {
        const res = await supabase.auth.signInWithPassword({ email, password });
        error = res.error;
    }
    
    if (error) Alert.alert("Errore Login", error.message);
    setLoadingAuth(false);
  };

  const handleLogout = async () => {
    setUserRole(null); setSession(null); setAgentCodes([]); setSentAlerts([]); setIsPendingApproval(false);
    await supabase.auth.signOut();
  };

  // --- LOGICA AGENTE ---
  const fetchAgentCodes = async (email) => {
     if(!email) return;
     const { data } = await supabase.from('agenti')
        .select('*')
        .eq('email', email)
        .not('codice_sconto', 'is', null) 
        .order('created_at', { ascending: false });
     if(data) setAgentCodes(data);
  };

  const fetchAgentAlerts = async (email) => {
      if(!email) return;
      const { data } = await supabase.from('alerts').select('*').eq('agent_email', email).order('created_at', { ascending: false });
      if(data) setSentAlerts(data);
  };

  const saveOrUpdateCode = async () => {
     if(!newCodeData.codice_sconto) return Alert.alert("Errore", "Codice mancante");
     const userEmail = session?.user?.email;
     const userMeta = session?.user?.user_metadata;
     if(!userEmail) return;

     const payload = {
         codice_sconto: newCodeData.codice_sconto.toUpperCase(),
         descrizione_interna: newCodeData.descrizione_interna,
         s_sementi: newCodeData.s_sementi, s_granulari: newCodeData.s_granulari, s_liquidi: newCodeData.s_liquidi,     
         ...(editingId ? {} : { nome_agente: userMeta?.full_name, email: userEmail, azienda: userMeta?.company, approvato: true })
     };
     
     let error;
     if (editingId) {
         const res = await supabase.from('agenti').update(payload).eq('id', editingId);
         error = res.error;
     } else {
         const res = await supabase.from('agenti').insert(payload);
         error = res.error;
     }

     if(error) {
         Alert.alert("Errore Salvataggio", error.message);
     } else {
         Alert.alert("Salvato", "Codice attivo!");
         setEditingId(null);
         setNewCodeData({ descrizione_interna: '', codice_sconto: '', s_sementi: '', s_granulari: '', s_liquidi: '' });
         fetchAgentCodes(userEmail); 
     }
  };

  const deleteCode = async (id) => {
      await supabase.from('agenti').delete().eq('id', id);
      fetchAgentCodes(session?.user?.email);
  };

  const startEditing = (item) => {
      setEditingId(item.id);
      setNewCodeData({ codice_sconto: item.codice_sconto, descrizione_interna: item.descrizione_interna, s_sementi: item.s_sementi || '', s_granulari: item.s_granulari || '', s_liquidi: item.s_liquidi || '' });
  };

  const toggleAlertProduct = (product) => {
      const exists = alertProducts.find(p => p.id === product.id);
      if (exists) setAlertProducts(alertProducts.filter(p => p.id !== product.id));
      else setAlertProducts([...alertProducts, product]);
  };

  const sendAlert = async () => {
      if(!alertMessage) return Alert.alert("Errore", "Scrivi un messaggio");
      const userEmail = session?.user?.email;
      if(!userEmail) return;
      const productNames = alertProducts.map(p => p.nome).join(', ');
      const { error } = await supabase.from('alerts').insert({
          agent_email: userEmail,
          company: session?.user?.user_metadata?.company,
          message: alertMessage,
          product_name: productNames || null
      });
      if(error) Alert.alert("Errore", error.message);
      else {
          Alert.alert("Inviato!", "Avviso trasmesso.");
          setAlertMessage(''); setAlertProducts([]);
          fetchAgentAlerts(userEmail);
      }
  };

  const deleteAlert = async (id) => {
      await supabase.from('alerts').delete().eq('id', id);
      fetchAgentAlerts(session?.user?.email);
  };

  // --- LOGICA CLIENTE: VALIDAZIONE CODICE ---
  const validaCodice = async () => {
     if(!inputCodicePartner) return;
     const code = inputCodicePartner.toUpperCase().trim();
     
     // 1. Controllo duplicati locali
     const isAlreadyActive = activePartners.some(p => p.codice_sconto === code);
     if(isAlreadyActive) { Alert.alert("Già Attivo", "Codice già presente."); setInputCodicePartner(''); return; }

     // 2. Chiamata al Database (ADESSO FUNZIONA CON LA NUOVA SQL POLICY)
     const { data, error } = await supabase
        .from('agenti')
        .select('*')
        .eq('codice_sconto', code)
        .eq('approvato',true)
        .single();
     
     if(error) {
         console.log("Errore ricerca codice:", error);
         Alert.alert("Errore", "Codice non valido o problema di connessione.");
         return;
     }

     if(data) { 
         // Sostituisci eventuale codice precedente della stessa azienda
         const filteredPartners = activePartners.filter(p => p.azienda !== data.azienda);
         const newPartnersList = [...filteredPartners, data];
         setActivePartners(newPartnersList);
         setDismissCount(0); 
         Alert.alert("Listino Aggiunto!", `Ora hai accesso agli sconti ${data.azienda} di ${data.nome_agente}.`); 
         setInputCodicePartner('');
     } else {
         Alert.alert("Errore", "Codice non trovato.");
     }
  };

  const removePartner = (codice) => { setActivePartners(activePartners.filter(p => p.codice_sconto !== codice)); };

  const showCodeDetails = (item) => {
      Alert.alert(
          `Dettagli: ${item.codice_sconto}`,
          `Sementi: ${item.s_sementi || '0'}%\nGranulari: ${item.s_granulari || '0'}%\nLiquidi: ${item.s_liquidi || '0'}%\n\n${item.descrizione_interna || ''}`
      );
  };

  const getDiscount = (p) => {
    if(activePartners.length === 0) return '0';
    const partnerForThisBrand = activePartners.find(ap => (ap.azienda||'').toUpperCase() === (p.marca||'').toUpperCase());
    if (!partnerForThisBrand) return '0';
    const c = (p.categoria||'').toUpperCase();
    if(c.includes('SEMENTI')) return partnerForThisBrand.s_sementi;
    if(c.includes('LIQUID')||c.includes('BIO')||c.includes('BAGNANT')) return partnerForThisBrand.s_liquidi;
    return partnerForThisBrand.s_granulari;
  };

  const applyDisc = (price, discStr) => {
    if(!discStr || discStr==='0') return price;
    let final = price;
    discStr.split('+').forEach(d => { const val = parseFloat(d); if(!isNaN(val) && val > 0) final = final - (final * (val/100)); });
    return final;
  };
  const calcSpecs = (p, mq, mode) => {
    const size = parseFloat(mq) || 0;
    const price = parseFloat(p.prezzo) || 0;
    const finalPriceUnit = applyDisc(price, getDiscount(p));
    let qty = 0, unit = '';
    const isLiquid = ['ML','L','LT'].includes((p.unita_misura||'').toUpperCase()) || (p.categoria||'').toUpperCase().includes('LIQUID');
    if (mode === 'FOGLIARE' && p.dose_fogliare > 0) { qty = (parseFloat(p.dose_fogliare) * size) / 100 / 1000; unit = 'L'; } 
    else { qty = (parseFloat(p.dose_radicale||0) * size) / 1000; unit = isLiquid ? 'L' : 'Kg'; }
    return { qty, unit, singlePrice: finalPriceUnit, totalCost: qty * finalPriceUnit };
  };
  const updateCartQuantity = (id, txt) => { setCartItems(cartItems.map(p => p.id === id ? {...p, quantity: txt} : p)); };
  const calculateCartTotal = () => { return cartItems.reduce((acc, p) => { const q = parseFloat(p.quantity) || 0; const price = applyDisc(parseFloat(p.prezzo)||0, getDiscount(p)); return acc + (q * price); }, 0); };
  const toggleFavorite = async (id) => { let newFavs = favorites.includes(id) ? favorites.filter(fid => fid !== id) : [...favorites, id]; setFavorites(newFavs); await AsyncStorage.setItem('FAVS', JSON.stringify(newFavs)); };
  const toggleMix = (product) => { const exists = mixItems.find(x => x.id === product.id); if (exists) setMixItems(mixItems.filter(x => x.id !== product.id)); else { const defaultMode = product.dose_radicale > 0 ? 'RADICALE' : 'FOGLIARE'; setMixItems([...mixItems, { ...product, mixMode: defaultMode }]); } };
  const toggleCart = (product) => { const exists = cartItems.find(p => p.id === product.id); if (exists) setCartItems(cartItems.filter(p => p.id !== product.id)); else setCartItems([...cartItems, { ...product, quantity: '' }]); };
  const printPDF = async () => { let total = 0; const rows = cartItems.map(p => { const q = parseFloat(p.quantity) || 0; const price = applyDisc(parseFloat(p.prezzo)||0, getDiscount(p)); const cost = q * price; total += cost; return `<tr><td style="padding:10px;border-bottom:1px solid #ddd"><b>${p.nome}</b><br/><span style="font-size:10px;color:#666">${p.marca}</span></td><td style="padding:10px;border-bottom:1px solid #ddd;text-align:center;">${p.quantity || '0'} <span style="font-size:10px">${p.unita_misura}</span></td><td style="padding:10px;border-bottom:1px solid #ddd;text-align:right;">€ ${cost.toFixed(2)}</td></tr>`; }).join(''); const html = `<html><body style="font-family:Helvetica;padding:40px;"><div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #00C853;padding-bottom:20px;"><div><h1 style="color:#1B5E20;margin:0;">Preventivo</h1><p style="margin:0;color:#666;font-size:12px;">AgriManager powered by Sinelica</p></div><div style="text-align:right;"><p>Data: ${new Date().toLocaleDateString()}</p><p>Listini attivi: <b>${activePartners.length}</b></p></div></div><table style="width:100%;border-collapse:collapse;margin-top:30px;"><tr style="background:#f5f5f5;color:#333"><th style="text-align:left;padding:10px">PRODOTTO</th><th style="text-align:center;">QUANTITÀ</th><th style="text-align:right;">PREZZO</th></tr>${rows}</table><div style="margin-top:30px;text-align:right;"><p style="font-size:14px;color:#666;">TOTALE PREVENTIVO</p><h2 style="color:#00C853;margin:0;">€ ${total.toFixed(2)}</h2></div></body></html>`; try { const { uri } = await Print.printToFileAsync({ html }); await Sharing.shareAsync(uri); } catch(e){} };

  // --- RENDER ---
  if(!appIsReady) return <View style={styles.center}><ActivityIndicator size="large" color={THEME.accent}/></View>;

  // 1. SCHERMATA "IN ATTESA DI APPROVAZIONE"
  if(isPendingApproval) return (
      <View style={styles.center}>
          <Ionicons name="time-outline" size={80} color={THEME.warning} />
          <Text style={{fontSize:22, fontWeight:'bold', marginTop:20, color:THEME.textDark}}>REGISTRAZIONE INVIATA</Text>
          <Text style={{textAlign:'center', marginTop:10, paddingHorizontal:40, color:'#666', lineHeight:22}}>
              Il tuo account è stato creato correttamente.{'\n'}
              Attendi che l'amministrazione attivi il tuo profilo Agente.
          </Text>
          
          <TouchableOpacity style={[styles.btnBig, {marginTop:40, width:250}]} onPress={checkApprovalStatus} disabled={loadingAuth}>
              {loadingAuth ? <ActivityIndicator color="#fff"/> : <Text style={styles.btnText}>VERIFICA ATTIVAZIONE</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={[styles.btnOutline, {marginTop:15, width:250}]} onPress={handleLogout}>
              <Text style={{color:THEME.textDark, fontWeight:'bold'}}>ESCI / TORNA ALLA HOME</Text>
          </TouchableOpacity>
      </View>
  );

  // 2. LANDING PAGE
  if(!userRole) return (
    <View style={styles.center}>
       <View style={{transform:[{scale:1.5}], marginBottom:50}}><BrandLogo/></View>
       <TouchableOpacity style={styles.btnBig} onPress={()=>setUserRole('CLIENTE')}><Text style={styles.btnText}>ENTRA NELLO SHOP</Text></TouchableOpacity>
       <TouchableOpacity style={[styles.btnOutline,{marginTop:20}]} onPress={()=>{setShowAuthModal(true); setIsRegistering(false);}}><Text style={{color:THEME.textDark, fontWeight:'bold'}}>AREA RAPPRESENTANTI</Text></TouchableOpacity>
       <Modal visible={showAuthModal} transparent animationType="fade" onRequestClose={()=>setShowAuthModal(false)}>
          <View style={styles.modalOverlay}>
             <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>{isRegistering ? 'Registrazione Agente' : 'Login Agente'}</Text>
                {isRegistering && ( <>
                    <TextInput style={styles.pinInput} placeholder="Nome e Cognome" value={regName} onChangeText={setRegName}/>
                    <TouchableOpacity style={[styles.pinInput, {flexDirection:'row', justifyContent:'space-between'}]} onPress={()=>setShowRegDropdown(!showRegDropdown)}>
                        <Text style={{color: regCompany ? '#000':'#999'}}>{regCompany || "Seleziona Azienda"}</Text>
                        <Ionicons name="chevron-down" size={20}/>
                    </TouchableOpacity>
                    {showRegDropdown && ( <View style={{width:'100%', borderWidth:1, borderColor:'#eee', marginBottom:10, borderRadius:8, maxHeight:150}}><ScrollView>{availableBrands.map(c => (<TouchableOpacity key={c} style={{padding:12, borderBottomWidth:1, borderColor:'#eee'}} onPress={()=>{setRegCompany(c); setShowRegDropdown(false)}}><Text>{c}</Text></TouchableOpacity>))}</ScrollView></View> )}
                </>)}
                <TextInput style={styles.pinInput} placeholder="Email" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail}/>
                <TextInput style={styles.pinInput} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword}/>
                <TouchableOpacity style={[styles.btnBig, {marginTop:10}]} onPress={handleAuth} disabled={loadingAuth}>{loadingAuth ? <ActivityIndicator color="#fff"/> : <Text style={styles.btnText}>{isRegistering ? 'REGISTRATI' : 'ACCEDI'}</Text>}</TouchableOpacity>
                <TouchableOpacity onPress={()=>setIsRegistering(!isRegistering)} style={{marginTop:20}}><Text style={{color:THEME.primary, fontWeight:'bold'}}>{isRegistering ? "Hai account? Accedi" : "Registrati ora"}</Text></TouchableOpacity>
                <TouchableOpacity onPress={()=>setShowAuthModal(false)} style={{marginTop:15}}><Text style={{color:'red'}}>Annulla</Text></TouchableOpacity>
             </View>
          </View>
       </Modal>
    </View>
  );

  // 3. DASHBOARD AGENTE (SOLO SE APPROVATO)
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
                       <TouchableOpacity style={[styles.btnBig, {marginTop:15, backgroundColor: editingId ? THEME.warning : THEME.textDark}]} onPress={saveOrUpdateCode}>
                           <Text style={styles.btnText}>{editingId ? "AGGIORNA" : "SALVA"}</Text>
                       </TouchableOpacity>
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
                               <TouchableOpacity style={{flex:2, padding:8}} onPress={()=>showCodeDetails(item)}>
                                   <Text style={{color:THEME.accent, fontWeight:'bold', textDecorationLine:'underline'}}>{item.codice_sconto}</Text>
                               </TouchableOpacity>
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
                       <TextInput style={[styles.inputSmall, {height:60, textAlignVertical:'top'}]} multiline placeholder="Messaggio per i clienti..." value={alertMessage} onChangeText={setAlertMessage}/>
                       <TouchableOpacity style={[styles.inputSmall, {marginTop:10, flexDirection:'row', justifyContent:'space-between'}]} onPress={()=>setShowProductPicker(true)}>
                           <Text style={{color: alertProducts.length>0 ? THEME.primary : '#999', fontWeight: alertProducts.length>0?'bold':'normal'}}>
                               {alertProducts.length > 0 ? `${alertProducts.length} Prodotti Selezionati` : "Seleziona Prodotti (Opz)"}
                           </Text>
                           <Ionicons name="list" size={20} color="#666"/>
                       </TouchableOpacity>
                       {alertProducts.length > 0 && <Text style={{fontSize:10, color:THEME.primary, marginTop:5}}>Consiglia: {alertProducts.map(p => p.nome).join(', ')}</Text>}
                       <TouchableOpacity style={[styles.btnBig, {marginTop:15, backgroundColor:THEME.danger}]} onPress={sendAlert}>
                           <Ionicons name="megaphone-outline" size={20} color="#fff" style={{marginRight:5}}/>
                           <Text style={styles.btnText}>INVIA AI CLIENTI</Text>
                       </TouchableOpacity>
                   </View>
                   <Text style={[styles.sectionTitle, {marginTop:20, marginLeft:5}]}>STORICO AVVISI</Text>
                   {sentAlerts.map((alert, idx) => (
                       <View key={idx} style={{backgroundColor:'#fff', padding:15, borderRadius:10, marginBottom:10, borderLeftWidth:4, borderColor:THEME.danger, flexDirection:'row', justifyContent:'space-between'}}>
                           <View style={{flex:1}}>
                               <Text style={{fontWeight:'bold', color:THEME.danger}}>{alert.message}</Text>
                               {alert.product_name && <Text style={{fontSize:12, color:THEME.primary, marginTop:2}}>Consiglio: {alert.product_name}</Text>}
                               <Text style={{fontSize:10, color:'#999', marginTop:5}}>{new Date(alert.created_at).toLocaleDateString()}</Text>
                           </View>
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

  // 4. APP CLIENTE
  return (
    <SafeAreaView style={{flex:1, backgroundColor:THEME.bg, paddingTop: Platform.OS==='android'?StatusBar.currentHeight:0}}>
      <StatusBar barStyle="dark-content"/>
      {/* ALERT BOX PER IL CLIENTE - VISIBILE SOLO SE DISMISS COUNT < 3 */}
      {clientAlerts.length > 0 && dismissCount < 3 && (
          <View>
              {clientAlerts.map((alert, idx) => (
                  <View key={idx} style={{backgroundColor:THEME.danger, padding:10, marginBottom:1, flexDirection:'row', alignItems:'center', justifyContent:'center'}}>
                      <Ionicons name="warning" size={20} color="#fff" style={{marginRight:10}}/>
                      <View style={{flex:1}}>
                          <Text style={{color:'#fff', fontWeight:'bold', fontSize:12}}>AVVISO URGENTE (da {alert.company}):</Text>
                          <Text style={{color:'#fff', fontSize:13}}>{alert.message}</Text>
                          {alert.product_name && <Text style={{color:'#fff', fontWeight:'bold', marginTop:2, textDecorationLine:'underline'}}>Consigliati: {alert.product_name}</Text>}
                      </View>
                  </View>
              ))}
              <TouchableOpacity onPress={handleCloseAlert} style={{backgroundColor:'#B71C1C', padding:8, alignItems:'center'}}>
                  <Text style={{color:'#fff', fontSize:12, fontWeight:'bold'}}>CHIUDI AVVISI (X)</Text>
              </TouchableOpacity>
          </View>
      )}

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
                 {['TUTTI', ...new Set(productsDB.map(i=>i.marca).filter(x=>x))].map(b => (
                    <TouchableOpacity key={b} onPress={()=>setSelectedBrand(b?b.toUpperCase():'TUTTI')} style={[styles.chip, selectedBrand===(b?b.toUpperCase():'TUTTI') && {backgroundColor:THEME.textDark}]}>
                       <Text style={[styles.chipText, selectedBrand===(b?b.toUpperCase():'TUTTI') && {color:'#fff'}]}>{b}</Text>
                    </TouchableOpacity>
                 ))}
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
         data={filteredDataSource}
         keyExtractor={i => i.id.toString()}
         contentContainerStyle={{padding:15, paddingBottom:100}}
         renderItem={({item}) => {
             const isFav = favorites.includes(item.id);
             const inCart = cartItems.some(p=>p.id===item.id);
             const inMix = mixItems.some(p=>p.id===item.id);
             return (
               <View style={[
                   styles.card, 
                   {borderColor: item.colore || '#eee', borderWidth: 2}, 
                   (inCart || inMix) && {backgroundColor:'#f9f9f9'}
               ]}>
                   <TouchableOpacity style={styles.cardLeft} onPress={()=>toggleFavorite(item.id)}>
                       <Ionicons name={isFav?"heart":"heart-outline"} size={26} color={isFav?THEME.danger:THEME.iconInactive}/>
                   </TouchableOpacity>
                   <TouchableOpacity style={styles.cardCenter} onPress={()=>{setSelectedProduct(item); setDetailMode('RADICALE');}}>
                       <Text style={styles.cardBrand}>{item.marca}</Text>
                       <Text style={styles.cardTitle}>{item.nome}</Text>
                       <Text style={styles.cardSub}>{item.categoria}</Text>
                   </TouchableOpacity>
                   <View style={styles.cardRight}>
                       <TouchableOpacity onPress={() => toggleMix(item)} style={{marginBottom:15}}>
                          <View style={{backgroundColor:inMix?THEME.primary:'#fff', padding:8, borderRadius:8, borderWidth:1, borderColor:inMix?THEME.primary:THEME.secondary}}>
                             <Ionicons name={inMix?"flask":"flask-outline"} size={22} color={inMix?"#fff":THEME.iconInactive}/>
                          </View>
                       </TouchableOpacity>
                       <TouchableOpacity onPress={() => toggleCart(item)}>
                          <View style={{backgroundColor:inCart?THEME.accent:'#fff', padding:8, borderRadius:8, borderWidth:1, borderColor:inCart?THEME.accent:THEME.secondary}}>
                             <Ionicons name={inCart?"cart":"cart-outline"} size={22} color={inCart?"#fff":THEME.iconInactive}/>
                          </View>
                       </TouchableOpacity>
                   </View>
               </View>
             );
         }}
      />
      <View style={{position:'absolute', bottom:30, right:20, flexDirection:'row', gap:15}}>
         {mixItems.length > 0 && (<TouchableOpacity style={[styles.fab, {backgroundColor:THEME.primary}]} onPress={()=>setShowMixListModal(true)}><Ionicons name="flask" size={24} color="#fff"/><Text style={styles.fabText}>MIX ({mixItems.length})</Text></TouchableOpacity>)}
         {cartItems.length > 0 && (<TouchableOpacity style={[styles.fab, {backgroundColor:THEME.accent}]} onPress={()=>setShowCartModal(true)}><Ionicons name="cart" size={24} color="#fff"/><Text style={styles.fabText}>ORDINE ({cartItems.length})</Text></TouchableOpacity>)}
      </View>
      <Modal visible={selectedProduct!==null} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setSelectedProduct(null)}>
         <View style={{flex:1, backgroundColor:'#fff'}}>
             {selectedProduct && (
                <ScrollView contentContainerStyle={{padding:25}}>
                   <Text style={styles.modalBrand}>{selectedProduct.marca}</Text>
                   <Text style={styles.modalTitle}>{selectedProduct.nome}</Text>
                   <View style={[styles.tag, {backgroundColor: selectedProduct.colore || THEME.textDark}]}><Text style={{color:'#fff', fontSize:10, fontWeight:'bold'}}>{selectedProduct.categoria}</Text></View>
                   <Text style={styles.desc}>{selectedProduct.descrizione}</Text>
                   <Text style={styles.comp}>🔬 {selectedProduct.composizione}</Text>
                   <View style={styles.calcBox}>
                      <Text style={{fontSize:12, fontWeight:'bold', color:THEME.textDark, marginBottom:10}}>CALCOLA FABBISOGNO</Text>
                      <TextInput style={styles.mqInputSmall} placeholder="MQ Prato" keyboardType="numeric" value={lawnSize} onChangeText={setLawnSize}/>
                      {lawnSize ? (
                         <View style={{marginTop:15, alignItems:'center'}}>
                             <View style={{flexDirection:'row', gap:10, marginBottom:10}}>
                                 <TouchableOpacity onPress={()=>setDetailMode('RADICALE')} style={{padding:8, borderRadius:5, backgroundColor:detailMode==='RADICALE'?THEME.radicale:'#eee'}}><Text style={{color:detailMode==='RADICALE'?'#fff':'#333', fontSize:12}}>RADICALE</Text></TouchableOpacity>
                                 <TouchableOpacity onPress={()=>setDetailMode('FOGLIARE')} style={{padding:8, borderRadius:5, backgroundColor:detailMode==='FOGLIARE'?THEME.fogliare:'#eee'}}><Text style={{color:detailMode==='FOGLIARE'?'#fff':'#333', fontSize:12}}>FOGLIARE</Text></TouchableOpacity>
                             </View>
                             <Text style={{fontSize:24, fontWeight:'bold', color:THEME.textDark}}>{calcSpecs(selectedProduct, lawnSize, detailMode).qty.toFixed(2)} {calcSpecs(selectedProduct, lawnSize, detailMode).unit}</Text>
                             <Text style={{color:THEME.accent, fontWeight:'bold', marginTop:5}}>Costo: € {calcSpecs(selectedProduct, lawnSize, detailMode).totalCost.toFixed(2)}</Text>
                         </View>
                      ) : <Text style={{fontSize:12, color:'#999', marginTop:5}}>Inserisci i MQ per calcolare.</Text>}
                   </View>
                   <TouchableOpacity style={{alignSelf:'center', marginTop:30}} onPress={()=>setSelectedProduct(null)}><Text style={{color:'#999'}}>Chiudi</Text></TouchableOpacity>
                </ScrollView>
             )}
         </View>
      </Modal>
      <Modal visible={showMixListModal} animationType="slide">
         <SafeAreaView style={{flex:1, backgroundColor:'#fff'}}>
             <View style={{flex:1, padding:20}}>
                <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:20}}>
                   <Text style={[styles.modalTitle, {color:THEME.primary}]}>Trattamento Tecnico</Text>
                   <TouchableOpacity onPress={()=>setShowMixListModal(false)}><Ionicons name="close" size={30}/></TouchableOpacity>
                </View>
                <View style={{backgroundColor:THEME.secondary, padding:15, borderRadius:10, marginBottom:20}}>
                   <Text style={{fontSize:12, fontWeight:'bold', color:THEME.primary}}>AREA TOTALE (MQ)</Text>
                   <TextInput style={styles.mqInput} placeholder="0" keyboardType="numeric" value={lawnSize} onChangeText={setLawnSize}/>
                </View>
                <ScrollView>
                   {mixItems.map((p, idx) => {
                       const specs = calcSpecs(p, lawnSize, p.mixMode);
                       return (
                          <View key={idx} style={styles.cartItem}>
                             <View style={{flex:1}}>
                                <Text style={{fontWeight:'bold', color:THEME.primary}}>{p.nome}</Text>
                                <View style={{flexDirection:'row', alignItems:'center', marginTop:5}}>
                                    <TouchableOpacity onPress={()=>{const newMode = p.mixMode==='RADICALE'?'FOGLIARE':'RADICALE'; const updatedMix = [...mixItems]; updatedMix[idx].mixMode = newMode; setMixItems(updatedMix);}} style={{backgroundColor:'#eee', padding:4, borderRadius:4, marginRight:10}}><Text style={{fontSize:10}}>{p.mixMode}</Text></TouchableOpacity>
                                    {lawnSize && <Text style={{fontWeight:'bold', color:THEME.textDark}}>{specs.qty.toFixed(2)} {specs.unit}</Text>}
                                </View>
                             </View>
                             <View style={{alignItems:'flex-end'}}>
                                 {lawnSize && <Text style={{fontWeight:'bold'}}>€ {specs.totalCost.toFixed(2)}</Text>}
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
                       return (
                          <View key={idx} style={styles.cartItem}>
                             <View style={{flex:1}}>
                                <Text style={{fontWeight:'bold', color:THEME.textDark, fontSize:16}}>{p.nome}</Text>
                                <Text style={{fontSize:12, color:THEME.primary}}>€ {price.toFixed(2)} / {p.unita_misura}</Text>
                             </View>
                             <View style={{alignItems:'flex-end'}}>
                                <View style={{flexDirection:'row', alignItems:'center', backgroundColor:THEME.secondary, borderRadius:8}}>
                                   <TextInput style={styles.qtyInput} placeholder="0" keyboardType="numeric" value={p.quantity} onChangeText={(t)=>updateCartQuantity(p.id, t)}/>
                                   <Text style={{paddingRight:10, fontSize:12, fontWeight:'bold', color:'#666'}}>{p.unita_misura}</Text>
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
  modalBrand: { fontSize:12, fontWeight:'bold', color:'#999', textTransform:'uppercase' },
  tag: { alignSelf:'flex-start', paddingHorizontal:8, borderRadius:4, marginVertical:5, paddingVertical:2 },
  desc: { fontSize:15, lineHeight:22, color:'#333', marginVertical:15 },
  comp: { fontSize:12, fontStyle:'italic', color:'#666', marginBottom:20 },
  calcBox: { backgroundColor:'#FFFDE7', padding:20, borderRadius:16, borderWidth:1, borderColor:'#FFF59D' },
  cartItem: { flexDirection:'row', alignItems:'center', paddingVertical:15, borderBottomWidth:1, borderColor:'#f0f0f0' },
  pinInput: { fontSize:18, padding:10, borderWidth:1, borderColor:'#eee', borderRadius:10, width:'100%', marginBottom:15 },
  
  // DASHBOARD STYLES
  cardForm: { backgroundColor:'#fff', padding:20, borderRadius:15, shadowColor:'#000', shadowOpacity:0.05, shadowRadius:10, elevation:3 },
  sectionTitle: { fontSize:16, fontWeight:'900', color:THEME.primary, marginBottom:15 },
  label: { fontSize:12, fontWeight:'bold', color:'#666', marginBottom:5, marginTop:10 },
  inputSmall: { backgroundColor:'#F5F7FA', padding:10, borderRadius:8, borderWidth:1, borderColor:'#E0E0E0' },
  inputDiscount: { backgroundColor:'#FFFDE7', padding:10, borderRadius:8, borderWidth:1, borderColor:'#FFEB3B', textAlign:'center', fontWeight:'bold' },
  dropdownBtn: { backgroundColor:'#F5F7FA', padding:12, borderRadius:8, borderWidth:1, borderColor:'#E0E0E0', flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  dropdownList: { backgroundColor:'#fff', borderWidth:1, borderColor:'#eee', borderRadius:8, marginTop:5 },
  table: { marginTop:10, backgroundColor:'#fff', borderRadius:10, overflow:'hidden', borderWidth:1, borderColor:'#eee' },
  tableRow: { flexDirection:'row', borderBottomWidth:1, borderColor:'#eee', alignItems:'center' },
  col: { padding:10, fontSize:13, color:'#333' },
  
  // TAB STYLE
  tab: { flex:1, alignItems:'center', padding:10, borderRadius:8 },
  activeTab: { backgroundColor:'#fff', shadowColor:'#000', shadowOpacity:0.1, shadowRadius:2, elevation:2 },
  tabText: { fontWeight:'bold', color:'#999' },
  activeTabText: { color:THEME.primary }
});