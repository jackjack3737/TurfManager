import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator, Alert, BackHandler, FlatList,
    KeyboardAvoidingView, Modal, Platform, SafeAreaView,
    ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View, Image
} from 'react-native';

// --- CONFIGURAZIONE CHIAVI ---
const WEATHER_API_KEY = 'b9f05ba6cff60cec20886ba24b486241'; 
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
  <View style={{flexDirection:'row', alignItems:'center', transform: [{scale}], alignSelf:'flex-start'}}>
    <Image
      source={require('./assets/logo.png')}
      style={{width:44, height:44, marginRight:12, borderRadius:6}}
      resizeMode="contain"
    />
    <View style={{alignItems:'flex-start'}}>
      <Text style={{fontSize:24, fontWeight:'900', color:THEME.textDark}}>TurfManager</Text>
      <Text style={{fontSize:10, color:THEME.accent, fontWeight:'bold', letterSpacing:1}}>SINELICA DIGITAL</Text>
    </View>
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

const getProductColor = (product) => (product && product.colore) ? product.colore : getCategoryColor(product?.categoria);

const shouldShowBrand = (categoria) => {
    if (!categoria) return true;
    const c = categoria.toUpperCase();
    if (c.includes('FUNGICIDA') || c.includes('DISERBANTE') || c.includes('INSETTICIDA') || c.includes('PFNPE')) return false;
    return true; 
};

const getCleanCategoryName = (categoria) => {
    if (!categoria) return '';
    return categoria; 
};

const PHARMACY_BRANDS = ['FITOFARMACI'];

const isPharmacyBrand = (brand) => {
    if (!brand) return false;
    const b = String(brand).toUpperCase().trim();
    return PHARMACY_BRANDS.includes(b);
};

const isPharmacyCategory = (cat) => {
    if(!cat) return false;
    const c = cat.toUpperCase();
    return c.includes('FUNGICIDA') || c.includes('DISERBANTE') || c.includes('INSETTICIDA') || c.includes('PFNPE');
};

const isPharmacyProduct = (p) => {
    if (!p) return false;
    return isPharmacyCategory(p.categoria) || isPharmacyBrand(p.marca);
};

const getDisplayUnit = (unit) => {
    if(!unit) return '';
    const u = unit.toLowerCase();
    if(u === 'ml' || u === 'l' || u === 'lt') return 'L';
    if(u === 'g' || u === 'kg') return 'Kg';
    return unit;
};

const IT_MONTHS = [
  'Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
  'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'
];

const isCurrentMonthAllowed = (periodo_uso) => {
    if (!periodo_uso) return false;
    const now = new Date();
    const currentMonthName = IT_MONTHS[now.getMonth()];
    if (Array.isArray(periodo_uso)) {
        return periodo_uso.includes(currentMonthName);
    }
    const text = String(periodo_uso);
    return text.includes(currentMonthName);
};

// --- LOGICA METEO AGRONOMICO ---
const getAgronomicAdvice = (weather) => {
    if (!weather) return { status: '...', advice: '...', color: '#999' };

    const currentMonth = new Date().getMonth() + 1; 
    const isWinterOffSeason = currentMonth === 12 || currentMonth === 1 || currentMonth === 2;

    const temp = weather.main.temp;
    const main = weather.weather[0].main; 
    
    if (isWinterOffSeason || main === 'Snow' || temp <= 5) {
        return { status: '❄️ RIPOSO INVERNALE', advice: 'Fuori stagione (Dic-Feb). Prato a riposo.', color: '#90A4AE' };
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
  const [session, setSession] = useState(null);

  // --- BIG DATA & METEO ---
  const [deviceId, setDeviceId] = useState(null);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [welcomeData, setWelcomeData] = useState({ tipo: 'HOBBISTA', citta: '', mq: '' });
  const [weatherData, setWeatherData] = useState(null);

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
  
  const [showSOSModal, setShowSOSModal] = useState(false);
  const [showDisclaimerModal, setShowDisclaimerModal] = useState(false);
  const [sosSearch, setSosSearch] = useState('');
  const [showFavModal, setShowFavModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [lawnSize, setLawnSize] = useState('');
  const [favorites, setFavorites] = useState([]);

  // --- GESTIONE CHIUSURA AUTOMATICA MODALI ---
  useEffect(() => {
    if (cartItems.length === 0) setShowCartModal(false);
  }, [cartItems]);

  useEffect(() => {
    if (mixItems.length === 0) setShowMixListModal(false);
  }, [mixItems]);

  // --- BACK HANDLER ---
  useEffect(() => {
    const backAction = () => {
        if (selectedProduct) { setSelectedProduct(null); return true; }
        if (showCartModal) { setShowCartModal(false); return true; }
        if (showMixListModal) { setShowMixListModal(false); return true; }
        if (showSOSModal) { setShowSOSModal(false); return true; }
        if (showFavModal) { setShowFavModal(false); return true; }
        if (showDisclaimerModal) { setShowDisclaimerModal(false); return true; }
        if (showSettingsModal) { setShowSettingsModal(false); return true; }
        if (showWelcomeModal) { return false; }
        return false; 
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [selectedProduct, showCartModal, showMixListModal, showSOSModal, showFavModal, showSettingsModal, showWelcomeModal, showDisclaimerModal]);

  // --- INIT ---
  useEffect(() => {
    checkUserIdentity().then((id) => { if(id) loadUserProfile(id); });
    loadCommonData().then(() => initAppCliente());
  }, []);

  const checkUserIdentity = async () => {
      try {
          let id = await AsyncStorage.getItem('DEVICE_ID');
          if (!id) { id = 'user_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now(); await AsyncStorage.setItem('DEVICE_ID', id); }
          setDeviceId(id); return id;
      } catch (e) { return null; }
  };

  const loadUserProfile = async (id) => {
      const { data } = await supabase.from('profili_anonimi').select('*').eq('device_id', id).single();
      if (data) {
          setWelcomeData({ tipo: data.tipo_utente, citta: data.citta_base, mq: data.mq_prato_default?.toString() || '' });
          if(data.mq_prato_default) { setLawnSize(data.mq_prato_default.toString()); AsyncStorage.setItem('LAWN_SIZE', data.mq_prato_default.toString()); }
          if(data.citta_base) fetchWeather(data.citta_base);
      }
  };

  const fetchWeather = async (city) => {
      if(!city) return;
      try {
          const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${WEATHER_API_KEY}&units=metric&lang=it`);
          const data = await response.json();
          if(data.cod === 200) { setWeatherData(data); trackEvent('METEO_CHECK', `Città: ${city}`); }
      } catch(e) {}
  };

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
      const { data } = await supabase.from('prodotti_turfmanager').select('*').order('marca').order('nome');
      if(data) setProductsDB(data);
      const savedSize = await AsyncStorage.getItem('LAWN_SIZE');
      if(savedSize) setLawnSize(savedSize);
  };
  const initAppCliente = async () => { try { const favs = await AsyncStorage.getItem('FAVS'); if(favs) setFavorites(JSON.parse(favs)); } catch (e) {} finally { setAppIsReady(true); } };
  const calcSpecs = (p, mq) => {
      const size = parseFloat(mq) || 0;
      const isLiquid = ['ML','L','LT'].includes((p.unita_misura||'').toUpperCase());
      const qRadRaw = (parseFloat(p.dose_radicale||0) * size);
      const qFogRaw = (parseFloat(p.dose_fogliare||0) * size);
      const qRadDisplay = isLiquid ? qRadRaw : (qRadRaw / 1000);
      const qFogDisplay = isLiquid ? qFogRaw : (qFogRaw / 1000);
      const unitDisplay = isLiquid ? 'ml' : 'Kg';
      return { qRad: qRadDisplay, qFog: qFogDisplay, unit: unitDisplay };
  };
  const updateCartQuantity = (id, txt) => { setCartItems(cartItems.map(p => p.id === id ? {...p, quantity: txt} : p)); };
  const toggleFavorite = async (id) => { let newFavs = favorites.includes(id) ? favorites.filter(fid => fid !== id) : [...favorites, id]; setFavorites(newFavs); await AsyncStorage.setItem('FAVS', JSON.stringify(newFavs)); };
  const toggleMix = (product) => { const exists = mixItems.find(x => x.id === product.id); if (exists) setMixItems(mixItems.filter(x => x.id !== product.id)); else { setMixItems([...mixItems, product]); } };
  const toggleCart = (product) => { const exists = cartItems.find(p => p.id === product.id); if (exists) setCartItems(cartItems.filter(p => p.id !== product.id)); else setCartItems([...cartItems, { ...product, quantity: '' }]); };
  const updateLawnSize = (t) => { setLawnSize(t); AsyncStorage.setItem('LAWN_SIZE', t); supabase.from('profili_anonimi').update({ ultimo_mq_usato: parseFloat(t)||0 }).eq('device_id', deviceId).then(); };
  const printPDF = async () => {
      const rows = cartItems.map(p => {
          const displayUnit = getDisplayUnit(p.unita_misura);
          return `<tr><td style="padding:5px;border-bottom:1px solid #ddd"><b>${p.nome}</b><br/><span style="font-size:10px;color:#666">${p.marca}</span></td><td style="padding:5px;border-bottom:1px solid #ddd;text-align:center;">${p.quantity || '0'} <span style="font-size:10px">${displayUnit}</span></td></tr>`;
      }).join('');
      const html = `<html><body style="font-family:Helvetica;padding:40px;"><div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #00C853;padding-bottom:10px;"><div><h1 style="color:#1B5E20;margin:0;font-size:24px;">Lista ordine</h1><p style="margin:0;color:#666;font-size:12px;">TurfManager powered by Sinelica</p></div><div style="text-align:right;"><p>Data: ${new Date().toLocaleDateString()}</p><h3 style="margin:0;">${customerName}</h3></div></div><table style="width:100%;border-collapse:collapse;margin-top:20px;"><tr style="background:#f5f5f5;color:#333"><th style="text-align:left;padding:5px">PRODOTTO</th><th style="text-align:center;">Q.TÀ</th></tr>${rows}</table></body></html>`;
      try { const { uri } = await Print.printToFileAsync({ html }); await Sharing.shareAsync(uri); trackEvent('STAMPA_PDF', `Articoli: ${cartItems.length}`); } catch(e){}
  };

  if(!appIsReady) return <View style={styles.center}><ActivityIndicator size="large" color={THEME.accent}/></View>;

  // --- UI: SHOP CLIENTI (PRINCIPALE) ---
  return (
    <SafeAreaView style={{flex:1, backgroundColor:THEME.bg, paddingTop: Platform.OS==='android'?StatusBar.currentHeight:0}}>
      <StatusBar barStyle="dark-content"/>

      <View style={styles.header}>
         <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
             <BrandLogo/>
             <View style={{flexDirection:'row', alignItems:'center', gap:15}}>
                 <TouchableOpacity onPress={()=>setShowFavModal(true)}>
                     <Ionicons name="heart" size={22} color="#333333"/>
                 </TouchableOpacity>
                 <TouchableOpacity onPress={()=>setShowSettingsModal(true)}><Ionicons name="settings-outline" size={22} color="#333333"/></TouchableOpacity>
                 <TouchableOpacity onPress={()=>setShowDisclaimerModal(true)}>
                     <Ionicons name="alert-circle-outline" size={28} color="#333333"/>
                 </TouchableOpacity>
             </View>
         </View>
         
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
                             return (<><Text style={{color: advice.color, fontWeight:'bold', fontSize:10}}>{advice.status}</Text><Text style={{fontSize:9, color:'#666', marginTop:0, maxWidth:120, textAlign:'right'}}>{advice.advice}</Text></>);
                         })()}
                     </View>
                 </View>
             ) : (
                 <Text style={{textAlign:'center', color:'#999', fontSize:10}}>Caricamento meteo...</Text>
             )}
         </View>

         <View style={[styles.searchBox, {height:40}]}>
             <Ionicons name="search" size={18} color="#666"/>
            <TextInput style={[styles.searchInput, {fontSize:14}]} placeholder="Cerca prodotto..." value={search} onChangeText={(t) => { setSearch(t); if(t.length > 3) trackEvent('RICERCA', t); }}/>
         </View>
         
        <View style={{marginTop:10}}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {[
                  'TUTTI',
                  ...new Set(
                  productsDB
                      .filter(p => {
                        if (!p.marca) return false;
                        if (!p.categoria || isPharmacyProduct(p)) return false;
                        if (selectedCategory !== 'TUTTI' && p.categoria.toUpperCase() !== selectedCategory) return false;
                        return true;
                      })
                      .map(p => p.marca)
                  )
                 ].map(b => (
                  <TouchableOpacity
                    key={b}
                    onPress={()=>setSelectedBrand(b?b.toUpperCase():'TUTTI')}
                    style={[styles.chip, selectedBrand===(b?b.toUpperCase():'TUTTI') && {backgroundColor:THEME.textDark}]}
                  >
                    <Text style={[styles.chipText, selectedBrand===(b?b.toUpperCase():'TUTTI') && {color:'#fff'}]}>
                      {b}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  onPress={()=>{ setShowSOSModal(true); trackEvent('APERTURA_FARMACIA', 'Filtro Fitofarmaci'); }}
                  style={[styles.chip, {backgroundColor:'#FFEBEE', flexDirection:'row', alignItems:'center'}]}
                >
                    <Ionicons name="medkit" size={16} color={THEME.danger} style={{marginRight:4}}/>
                    <Text style={[styles.chipText, {color:THEME.danger}]}>FITOFARMACI</Text>
                </TouchableOpacity>
            </ScrollView>
         </View>
         <View style={{marginTop:5}}>
           <ScrollView horizontal showsHorizontalScrollIndicator={false}>
             {['TUTTI',
               ...new Set(
                 productsDB
                   .filter(p => p.categoria && !isPharmacyProduct(p))
                   .map(p => p.categoria)
               )
             ].map(c => (
               <TouchableOpacity
                 key={c}
                 onPress={()=>setSelectedCategory(c?c.toUpperCase():'TUTTI')}
                 style={[
                   styles.chipSmall,
                   selectedCategory===(c?c.toUpperCase():'TUTTI') && {backgroundColor:THEME.accent, borderColor:THEME.accent}
                 ]}>
                 <Text
                   style={[
                     styles.chipTextSmall,
                     selectedCategory===(c?c.toUpperCase():'TUTTI') && {color:'#fff'}
                   ]}>
                   {c}
                 </Text>
               </TouchableOpacity>
             ))}
           </ScrollView>
         </View>
      </View>
      <FlatList 
        data={productsDB
            .filter(p => {
                if (isPharmacyProduct(p) && !search && selectedCategory !== 'SOS FARMACIA') return false;
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
         contentContainerStyle={{padding:15, paddingBottom:20}} 
         renderItem={({item}) => {
             const isFav = favorites.includes(item.id);
             const inCart = cartItems.some(p=>p.id===item.id);
             const inMix = mixItems.some(p=>p.id===item.id);
             const cardColor = getProductColor(item);
             const showBrand = shouldShowBrand(item.categoria);

             return (
               <View style={[styles.card, {borderColor: cardColor, borderWidth: 2}, (inCart || inMix) && {backgroundColor:'#f9f9f9'}]}>
                   <TouchableOpacity style={styles.cardLeft} onPress={()=>toggleFavorite(item.id)}><Ionicons name={isFav?"heart":"heart-outline"} size={26} color={isFav?THEME.danger:THEME.iconInactive}/></TouchableOpacity>
                   <TouchableOpacity style={styles.cardCenter} onPress={()=>{setSelectedProduct(item); trackEvent('VISUALIZZA_PRODOTTO', item.nome); }}>
                       {showBrand && <HighlightText baseStyle={styles.cardBrand} text={item.marca} term={search} />}
                      <HighlightText baseStyle={styles.cardTitle} text={item.nome} term={search} />
                       <HighlightText baseStyle={[styles.cardSub, {color: cardColor, fontWeight:'bold'}]} text={getCleanCategoryName(item.categoria)} term={search} />
                       {item.periodo_uso && (
                         <View style={{marginTop:4}}>
                           <Text style={{fontSize:9, color:'#666'}}>⏱ {Array.isArray(item.periodo_uso) ? item.periodo_uso.join(', ') : item.periodo_uso}</Text>
                           {isCurrentMonthAllowed(item.periodo_uso) && (
                             <View style={{marginTop:3, alignSelf:'flex-start', paddingHorizontal:6, paddingVertical:2, borderRadius:6, backgroundColor:'rgba(0,200,83,0.12)', flexDirection:'row', alignItems:'center'}}>
                               <Ionicons name="checkmark-circle" size={12} color={THEME.accent} style={{marginRight:4}}/>
                               <Text style={{fontSize:10, color:THEME.accent, fontWeight:'bold'}}>
                                 PERIODO CORRETTO PER L'UTILIZZO
                               </Text>
                             </View>
                           )}
                         </View>
                       )}
                   </TouchableOpacity>
                   <View style={styles.cardRight}>
                       <TouchableOpacity onPress={() => toggleMix(item)} style={{marginBottom:10}}><View style={{backgroundColor:inMix?THEME.primary:'#fff', padding:6, borderRadius:8, borderWidth:1, borderColor:inMix?THEME.primary:THEME.secondary}}><Ionicons name={inMix?"flask":"flask-outline"} size={20} color={inMix?"#fff":THEME.iconInactive}/></View></TouchableOpacity>
                       <TouchableOpacity onPress={() => toggleCart(item)}><View style={{backgroundColor:inCart?THEME.accent:'#fff', padding:6, borderRadius:8, borderWidth:1, borderColor:inCart?THEME.accent:THEME.secondary}}><Ionicons name={inCart?"cart":"cart-outline"} size={20} color={inCart?"#fff":THEME.iconInactive}/></View></TouchableOpacity>
                   </View>
               </View>
             );
         }}
      />
      
      {/* --- BOTTOM BAR --- */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: 10, paddingBottom: Platform.OS === 'android' ? 25 : 10, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#eee', elevation: 15, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.1, shadowRadius: 5 }}>
         {mixItems.length > 0 && (<TouchableOpacity style={{alignItems:'center', marginHorizontal:20}} onPress={()=>setShowMixListModal(true)}><View style={{backgroundColor:THEME.primary, width:40, height:40, borderRadius:20, alignItems:'center', justifyContent:'center'}}><Ionicons name="flask" size={20} color="#fff"/></View><Text style={{fontSize:10, color:THEME.primary, fontWeight:'bold', marginTop:2}}>MIX ({mixItems.length})</Text></TouchableOpacity>)}
         {cartItems.length > 0 && (<TouchableOpacity style={{alignItems:'center', marginHorizontal:20}} onPress={()=>setShowCartModal(true)}><View style={{backgroundColor:THEME.accent, width:40, height:40, borderRadius:20, alignItems:'center', justifyContent:'center'}}><Ionicons name="cart" size={20} color="#fff"/></View><Text style={{fontSize:10, color:THEME.accent, fontWeight:'bold', marginTop:2}}>ORDINE ({cartItems.length})</Text></TouchableOpacity>)}
      </View>

      {/* --- MODAL SOS --- */}
      <Modal visible={showSOSModal} animationType="slide" onRequestClose={()=>setShowSOSModal(false)}>
          <SafeAreaView style={{flex:1, backgroundColor:'#fff'}}>
              <View style={{padding:20, backgroundColor:THEME.danger, flexDirection:'row', alignItems:'center', justifyContent:'space-between'}}>
                  <View style={{flexDirection:'row', alignItems:'center'}}><Ionicons name="medkit" size={30} color="#fff" style={{marginRight:10}}/><Text style={{fontSize:22, fontWeight:'bold', color:'#fff'}}>FARMACIA</Text></View>
                  <TouchableOpacity onPress={()=>setShowSOSModal(false)}><Ionicons name="close-circle" size={36} color="#fff"/></TouchableOpacity>
              </View>
              <View style={{padding:10, backgroundColor:THEME.danger}}><View style={[styles.searchBox, {backgroundColor:'#fff', marginBottom:0}]}><Ionicons name="search" size={20} color="#666"/><TextInput style={styles.searchInput} placeholder="Cerca fungicida, diserbante..." value={sosSearch} onChangeText={(t) => { setSosSearch(t); if(t.length > 3) trackEvent('RICERCA_FARMACIA', t); }}/></View></View>
              <View style={{padding:15, backgroundColor:'#FFEBEE'}}><Text style={{color:THEME.danger, fontSize:12, fontWeight:'bold', textAlign:'center'}}>⚠️ ATTENZIONE: Questi prodotti richiedono cautela. Usa le dosi indicate e consulta le schede di sicurezza.</Text></View>
              <FlatList
                contentContainerStyle={{padding:15}}
                data={productsDB
                  .filter(p => {
                    if (!isPharmacyProduct(p)) return false;
                    if (sosSearch && getSearchScore(p, sosSearch).count === 0) return false;
                    return true;
                  })
                  .sort((a, b) => {
                    if (!sosSearch) return 0;
                    const scoreA = getSearchScore(a, sosSearch);
                    const scoreB = getSearchScore(b, sosSearch);
                    if (scoreA.qty !== scoreB.qty) return scoreB.qty - scoreA.qty;
                    return scoreB.count - scoreA.count;
                  })}
                keyExtractor={i => i.id.toString()}
                renderItem={({item}) => (
                  <TouchableOpacity
                    onPress={()=>{setSelectedProduct(item); trackEvent('VISUALIZZA_FARMACO', item.nome); }}
                    style={{
                      flexDirection:'row',
                      backgroundColor:'#fff',
                      marginBottom:15,
                      borderRadius:12,
                      shadowColor:'#000',
                      shadowOpacity:0.1,
                      elevation:3,
                      borderLeftWidth:6,
                      borderColor:getProductColor(item)
                    }}>
                    <View style={{padding:20, flex:1}}>
                      <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                        <Text style={{fontSize:10, fontWeight:'bold', color:getProductColor(item)}}>
                          {getCleanCategoryName(item.categoria)}
                        </Text>
                      </View>
                      <HighlightText
                        baseStyle={{fontSize:18, fontWeight:'bold', color:'#333', marginVertical:5}}
                        text={item.nome}
                        term={sosSearch}
                      />
                      <HighlightText
                        baseStyle={{fontSize:12, color:'#666'}}
                        text={item.descrizione}
                        term={sosSearch}
                      />
                    </View>
                    <View style={{justifyContent:'center', paddingRight:20}}>
                      <Ionicons name="chevron-forward" size={24} color="#ccc"/>
                    </View>
                  </TouchableOpacity>
                )}
              />
          </SafeAreaView>
      </Modal>

      {/* --- MODAL FAV --- */}
      <Modal visible={showFavModal} animationType="slide" onRequestClose={()=>setShowFavModal(false)}>
          <SafeAreaView style={{flex:1, backgroundColor:'#fff'}}>
              <View style={{padding:20, borderBottomWidth:1, borderColor:'#eee', flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}><Text style={{fontSize:22, fontWeight:'bold', color:THEME.danger}}>I MIEI PREFERITI ❤️</Text><TouchableOpacity onPress={()=>setShowFavModal(false)}><Ionicons name="close" size={30}/></TouchableOpacity></View>
              {favorites.length === 0 ? ( <View style={{flex:1, justifyContent:'center', alignItems:'center'}}><Ionicons name="heart-dislike-outline" size={60} color="#ccc"/><Text style={{color:'#999', marginTop:10}}>Nessun prodotto nei preferiti</Text></View> ) : ( <FlatList contentContainerStyle={{padding:15}} data={productsDB.filter(p => favorites.includes(p.id))} keyExtractor={i => i.id.toString()} renderItem={({item}) => { const inCart = cartItems.some(p=>p.id===item.id); const inMix = mixItems.some(p=>p.id===item.id); return ( <View style={[styles.card, {borderColor: getProductColor(item), borderWidth: 2}, (inCart || inMix) && {backgroundColor:'#f9f9f9'}]}><TouchableOpacity style={styles.cardLeft} onPress={()=>toggleFavorite(item.id)}><Ionicons name="heart" size={26} color={THEME.danger}/></TouchableOpacity><TouchableOpacity style={styles.cardCenter} onPress={()=>{setSelectedProduct(item); }}><Text style={styles.cardBrand}>{item.marca}</Text><Text style={styles.cardTitle}>{item.nome}</Text><Text style={styles.cardSub}>{item.categoria}</Text></TouchableOpacity><View style={styles.cardRight}><TouchableOpacity onPress={() => toggleMix(item)} style={{marginBottom:15}}><View style={{backgroundColor:inMix?THEME.primary:'#fff', padding:8, borderRadius:8, borderWidth:1, borderColor:inMix?THEME.primary:THEME.secondary}}><Ionicons name={inMix?"flask":"flask-outline"} size={22} color={inMix?"#fff":THEME.iconInactive}/></View></TouchableOpacity><TouchableOpacity onPress={() => toggleCart(item)}><View style={{backgroundColor:inCart?THEME.accent:'#fff', padding:8, borderRadius:8, borderWidth:1, borderColor:inCart?THEME.accent:THEME.secondary}}><Ionicons name={inCart?"cart":"cart-outline"} size={22} color={inCart?"#fff":THEME.iconInactive}/></View></TouchableOpacity></View></View> ); }} /> )}
          </SafeAreaView>
      </Modal>

      {/* --- MODAL SETTINGS --- */}
      <Modal visible={showSettingsModal} animationType="slide" transparent onRequestClose={()=>setShowSettingsModal(false)}>
            <View style={styles.modalOverlay}>
                <View style={styles.modalCard}>
                    <Ionicons name="settings-outline" size={40} color={THEME.textDark} />
                    <Text style={{fontSize:22, fontWeight:'bold', color:THEME.textDark, marginTop:10, marginBottom:20}}>Impostazioni meteo</Text>
                    <Text style={{fontSize:13, color:'#666', marginBottom:10, textAlign:'center'}}>
                        Inserisci la tua città o CAP per aggiornare il meteo agronomico.
                    </Text>
                    <TextInput
                      style={[styles.inputContainer, {backgroundColor:'#fff'}]}
                      placeholder="Città o CAP"
                      value={welcomeData.citta}
                      onChangeText={t=>setWelcomeData({...welcomeData, citta:t})}
                    />
                    <TouchableOpacity style={[styles.btnBig, {marginTop:10}]} onPress={handleUpdateProfile}>
                      <Text style={styles.btnText}>AGGIORNA METEO</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={()=>setShowSettingsModal(false)} style={{marginTop:15}}>
                      <Text style={{color:THEME.danger}}>Chiudi</Text>
                    </TouchableOpacity>
                </View>
            </View>
      </Modal>

      {/* --- MODAL DISCLAIMER (NUOVO) --- */}
      <Modal visible={showDisclaimerModal} animationType="slide" transparent onRequestClose={()=>setShowDisclaimerModal(false)}>
            <View style={styles.modalOverlay}>
                <View style={[styles.modalCard, {padding:25}]}>
                    <Ionicons name="warning" size={50} color={THEME.warning} />
                    <Text style={{fontSize:20, fontWeight:'bold', marginTop:10, marginBottom:10, color:THEME.textDark}}>DISCLAIMER LEGALE</Text>
                    <ScrollView style={{maxHeight: 300, width: '100%'}}>
                        <Text style={{textAlign:'justify', lineHeight: 22, color:'#333', fontSize:14}}>
                            L'applicazione TurfManager fornisce suggerimenti e informazioni basate su dati generici. Tali indicazioni NON sostituiscono in alcun modo il parere professionale di un tecnico agronomo in loco. {'\n\n'}
                            L'uso dei prodotti fitosanitari (fungicidi, diserbanti, insetticidi) è regolato dalla legge. L'utente è l'unico responsabile del rispetto delle normative locali, delle dosi di etichetta e dell'uso dei dispositivi di protezione individuale (DPI). {'\n\n'}
                            Sinelica e gli sviluppatori declinano ogni responsabilità per danni a persone, cose, colture o ambiente derivanti dall'uso improprio delle informazioni fornite o dei prodotti suggeriti. Leggere sempre attentamente l'etichetta del prodotto prima dell'uso.
                        </Text>
                    </ScrollView>
                    <TouchableOpacity style={[styles.btnBig, {marginTop:20, backgroundColor:THEME.textDark}]} onPress={()=>setShowDisclaimerModal(false)}>
                        <Text style={styles.btnText}>HO CAPITO E ACCETTO</Text>
                    </TouchableOpacity>
                </View>
            </View>
      </Modal>

      {/* --- DETAIL MODAL --- */}
      <Modal visible={selectedProduct!==null} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setSelectedProduct(null)}>
        {selectedProduct && (
            <View style={{flex:1, backgroundColor:'#fff'}}>
                <View style={{backgroundColor: getProductColor(selectedProduct), padding:15, paddingTop:15, paddingBottom:15}}>
                      <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
                          <TouchableOpacity onPress={()=>setSelectedProduct(null)} style={{marginBottom:5}}><Ionicons name="close-circle" size={32} color={'rgba(0,0,0,0.5)'}/></TouchableOpacity>
                      </View>
                      <Text style={{fontSize:22, fontWeight:'bold', color:'#fff', lineHeight:26}}>{selectedProduct.nome}</Text>
                      <Text style={{fontSize:12, fontWeight:'bold', color:'rgba(255,255,255,0.9)', marginTop:2, textTransform:'uppercase'}}>{selectedProduct.marca} • {selectedProduct.categoria}</Text>
                 </View>
                 <View style={{flexDirection:'row', padding:10, gap:10, backgroundColor:'#f9f9f9', borderBottomWidth:1, borderColor:'#eee'}}>
                     {(() => {
                         const inMix = mixItems.some(i => i.id === selectedProduct.id);
                         const inCart = cartItems.some(i => i.id === selectedProduct.id);
                         return (
                             <>
                                 <TouchableOpacity onPress={() => toggleMix(selectedProduct)} style={{flex:1, padding:10, borderRadius:8, backgroundColor: inMix ? THEME.primary : '#fff', borderWidth:1, borderColor:THEME.primary, flexDirection:'row', alignItems:'center', justifyContent:'center'}}>
                                     <Ionicons name={inMix ? "flask" : "flask-outline"} size={20} color={inMix ? "#fff" : THEME.primary} style={{marginRight:5}}/>
                                     <Text style={{color: inMix ? "#fff" : THEME.primary, fontWeight:'bold'}}>{inMix ? "NEL MIX" : "AGGIUNGI MIX"}</Text>
                                 </TouchableOpacity>
                                 <TouchableOpacity onPress={() => toggleCart(selectedProduct)} style={{flex:1, padding:10, borderRadius:8, backgroundColor: inCart ? THEME.accent : '#fff', borderWidth:1, borderColor:THEME.accent, flexDirection:'row', alignItems:'center', justifyContent:'center'}}>
                                     <Ionicons name={inCart ? "cart" : "cart-outline"} size={20} color={inCart ? "#fff" : THEME.accent} style={{marginRight:5}}/>
                                     <Text style={{color: inCart ? "#fff" : THEME.accent, fontWeight:'bold'}}>{inCart ? "NEL CARRELLO" : "AGGIUNGI"}</Text>
                                 </TouchableOpacity>
                             </>
                         );
                     })()}
                 </View>
                <ScrollView contentContainerStyle={{padding:15}}>
                      <View style={[styles.newCalcBox, {marginTop:10, padding:15}]}>
                          <Text style={{textAlign:'center', fontWeight:'bold', color:THEME.textDark, fontSize:10, marginBottom:5}}>MQ DA TRATTARE</Text>
                          <TextInput style={[styles.newCalcInput, {fontSize:20, padding:10, marginBottom:10, width:'60%'}]} placeholder="0" keyboardType="numeric" value={lawnSize} onChangeText={updateLawnSize} onBlur={() => trackEvent('CALCOLO_DOSI', selectedProduct.nome, parseFloat(lawnSize))} />
                          {lawnSize ? (<>{(() => { const specs = calcSpecs(selectedProduct, lawnSize); return ( <View style={{flexDirection:'row', justifyContent:'space-around', width:'100%'}}>{specs.qRad > 0 && (<View style={{alignItems:'center'}}><Text style={{fontSize:10, color:'#8D6E63', fontWeight:'bold'}}>RADICALE</Text><Text style={[styles.newCalcResult, {fontSize:24, color:'#8D6E63'}]}>{specs.qRad.toFixed(2)} {specs.unit}</Text></View>)}{specs.qFog > 0 && (<View style={{alignItems:'center'}}><Text style={{fontSize:10, color:THEME.textDark, fontWeight:'bold'}}>FOGLIARE</Text><Text style={[styles.newCalcResult, {fontSize:24}]}>{specs.qFog.toFixed(2)} {specs.unit}</Text></View>)}</View>)})()}</>) : (<Text style={{textAlign:'center', fontSize:20, color:'#ccc', marginVertical:10}}>- {selectedProduct.unita_misura === 'L' || selectedProduct.unita_misura === 'ML' ? 'ml' : 'Kg'}</Text>)}
                      </View>
                      <Text style={{fontSize:12, color:'#999', marginTop:15, marginBottom:5}}>DESCRIZIONE TECNICA</Text><Text style={{fontSize:14, color:'#333', lineHeight:22}}>{selectedProduct.descrizione}</Text>
                      <Text style={{fontSize:12, color:'#999', marginTop:15, marginBottom:5}}>COMPOSIZIONE CHIMICA</Text><View style={{backgroundColor:'#F5F5F5', padding:10, borderRadius:10, borderWidth:1, borderColor:'#eee'}}><Text style={{color:'#444', fontStyle:'italic', fontSize:12}}>{selectedProduct.composizione || "Non specificata"}</Text></View>
                 </ScrollView>
            </View>
        )}
      </Modal>

      {/* Modal Mix AGGIORNATO CON PREZZI DINAMICI E HEADER COMPATTO */}
      <Modal visible={showMixListModal} animationType="slide" onRequestClose={()=>setShowMixListModal(false)}><SafeAreaView style={{flex:1, backgroundColor:'#fff'}}><View style={{flex:1, padding:20}}><View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:15}}><Text style={[styles.modalTitle, {color:THEME.primary}]}>Trattamento Tecnico</Text><TouchableOpacity onPress={()=>setShowMixListModal(false)}><Ionicons name="close" size={30}/></TouchableOpacity></View>{(() => {const hasRadicalOnly = mixItems.some(i => parseFloat(i.dose_radicale) > 0 && parseFloat(i.dose_fogliare) === 0); const hasFoliarOnly = mixItems.some(i => parseFloat(i.dose_fogliare) > 0 && parseFloat(i.dose_radicale) === 0); if (hasRadicalOnly && hasFoliarOnly) {return (<View style={{backgroundColor:'#FFEBEE', padding:10, borderRadius:8, marginBottom:10, flexDirection:'row', alignItems:'center'}}><Ionicons name="warning" size={24} color={THEME.danger} style={{marginRight:10}}/><Text style={{color:THEME.danger, fontSize:12, flex:1, fontWeight:'bold'}}>ATTENZIONE: Stai mischiando prodotti esclusivamente radicali con prodotti esclusivamente fogliari!</Text></View>)}})()}<View style={{backgroundColor:THEME.secondary, padding:10, borderRadius:10, marginBottom:15}}><Text style={{fontSize:12, fontWeight:'bold', color:THEME.primary}}>AREA TOTALE (MQ)</Text><TextInput style={styles.mqInput} placeholder="0" keyboardType="numeric" value={lawnSize} onChangeText={updateLawnSize}/></View><ScrollView>{mixItems.map((p, idx) => { const specs = calcSpecs(p, lawnSize); return ( <View key={idx} style={styles.cartItem}><View style={{flex:1}}><View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}><Text style={{fontWeight:'bold', color:THEME.primary, flex:1}}>{p.nome}</Text></View><View style={{marginTop:5}}>{specs.qRad > 0 && (<View style={{flexDirection:'row', alignItems:'center', marginBottom:2}}><View style={{backgroundColor:'#FFF3E0', paddingHorizontal:6, paddingVertical:2, borderRadius:4, marginRight:5}}><Text style={{fontSize:10, color:'#5D4037'}}>RAD</Text></View>{lawnSize ? <Text style={{fontWeight:'bold', color:'#333'}}>{specs.qRad.toFixed(2)} {specs.unit}</Text> : <Text style={{color:'#999'}}>-</Text>}</View>)}{specs.qFog > 0 && (<View style={{flexDirection:'row', alignItems:'center'}}><View style={{backgroundColor:'#E8F5E9', paddingHorizontal:6, paddingVertical:2, borderRadius:4, marginRight:5}}><Text style={{fontSize:10, color:'#1B5E20'}}>FOG</Text></View>{lawnSize ? <Text style={{fontWeight:'bold', color:'#333'}}>{specs.qFog.toFixed(2)} {specs.unit}</Text> : <Text style={{color:'#999'}}>-</Text>}</View>)}</View></View><View style={{alignItems:'flex-end'}}><TouchableOpacity onPress={()=>toggleMix(p)} style={{marginTop:5}}><Ionicons name="trash-outline" size={20} color={THEME.danger}/></TouchableOpacity></View></View>)})}</ScrollView></View></SafeAreaView></Modal>
      
      {/* Modal Carrello AGGIORNATO (Ordine prodotti) */}
      <Modal visible={showCartModal} animationType="slide" onRequestClose={()=>setShowCartModal(false)}><SafeAreaView style={{flex:1, backgroundColor:'#fff'}}><View style={{flex:1, padding:20}}><View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:10, alignItems:'center'}}><Text style={[styles.modalTitle, {color:THEME.accent}]}>Ordine prodotti</Text><TouchableOpacity onPress={()=>setShowCartModal(false)}><Ionicons name="close" size={30}/></TouchableOpacity></View><TextInput style={{backgroundColor:'#f0f0f0', padding:10, borderRadius:8, marginBottom:15, fontWeight:'bold', color:'#333'}} placeholder="Intestazione Ordine (es. Mario Rossi)" value={customerName} onChangeText={setCustomerName}/><ScrollView>{cartItems.map((p, idx) => { const qty = parseFloat(p.quantity)||0; const displayUnit = getDisplayUnit(p.unita_misura); return (<View key={idx} style={styles.cartItem}><View style={{flex:1}}><Text style={{fontWeight:'bold', color:THEME.textDark, fontSize:15}}>{p.nome}</Text></View><View style={{alignItems:'flex-end'}}><View style={{flexDirection:'row', alignItems:'center', backgroundColor:THEME.secondary, borderRadius:8}}><TextInput style={styles.qtyInput} placeholder="0" keyboardType="numeric" value={p.quantity} onChangeText={(t)=>updateCartQuantity(p.id, t)}/><Text style={{paddingRight:10, fontSize:12, fontWeight:'bold', color:'#666'}}>{displayUnit}</Text></View><TouchableOpacity onPress={()=>toggleCart(p)} style={{marginTop:5}}><Text style={{color:THEME.danger, fontSize:10}}>Rimuovi</Text></TouchableOpacity></View></View>);})}</ScrollView><View style={{borderTopWidth:1, borderColor:'#eee', paddingTop:15}}><TouchableOpacity style={styles.btnBig} onPress={printPDF}><Ionicons name="print-outline" size={24} color="#fff" style={{marginRight:10}}/><Text style={styles.btnText}>INVIA PDF</Text></TouchableOpacity></View></View></SafeAreaView></Modal>
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
  searchInput: { flex:1, marginLeft:10, fontSize:16, color:'#333' },
  mqInputSmall: { fontSize:24, fontWeight:'bold', textAlign:'center', borderBottomWidth:2, borderColor:THEME.accent, width:'60%', alignSelf:'center', padding:5, color:'#333' },
  mqInput: { fontSize:28, fontWeight:'bold', textAlign:'center', borderBottomWidth:1, borderColor:THEME.primary, color:'#333' },
  qtyInput: { width:50, textAlign:'center', padding:10, fontWeight:'bold', fontSize:16, color:'#333' },
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
  inputContainer: { flexDirection:'row', alignItems:'center', backgroundColor:'#F5F7FA', borderWidth:1, borderColor:'#E0E0E0', borderRadius:12, paddingHorizontal:15, paddingVertical:12, width:'100%', marginBottom:15, color:'#333' },
  dropContainer: { width:'100%', maxHeight:150, borderWidth:1, borderColor:'#E0E0E0', borderRadius:12, marginBottom:15, backgroundColor:'#fff', elevation: 5, zIndex: 1000 },
  dropItem: { padding:15, borderBottomWidth:1, borderColor:'#f0f0f0' },
  cardForm: { backgroundColor:'#fff', padding:20, borderRadius:15, shadowColor:'#000', shadowOpacity:0.05, shadowRadius:10, elevation:3 },
  sectionTitle: { fontSize:16, fontWeight:'900', color:THEME.primary, marginBottom:15 },
  label: { fontSize:12, fontWeight:'bold', color:'#666', marginBottom:5, marginTop:10 },
  inputSmall: { backgroundColor:'#F5F7FA', padding:10, borderRadius:8, borderWidth:1, borderColor:'#E0E0E0', color:'#333' },
  inputDiscount: { backgroundColor:'#FFFDE7', padding:10, borderRadius:8, borderWidth:1, borderColor:'#FFEB3B', textAlign:'center', fontWeight:'bold', color:'#333' },
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
  newCalcInput: { backgroundColor:'#fff', width:'80%', fontSize:24, fontWeight:'bold', textAlign:'center', padding:15, borderRadius:10, elevation:2, marginBottom:20, color:'#000' },
  newCalcResult: { fontSize:48, fontWeight:'bold', color:'#5E35B1' },
  
  // METEO STYLE
  weatherCard: { backgroundColor:'#fff', padding:10, borderRadius:12, marginBottom:5, shadowColor:'#000', shadowOpacity:0.05, shadowRadius:5, elevation:2 } // METEO RIDOTTO
});