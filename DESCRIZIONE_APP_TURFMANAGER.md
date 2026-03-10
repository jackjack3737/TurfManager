# TurfManager – Descrizione dettagliata dell’app (per Gemini)

## 1. Panoramica

**TurfManager** è un’app mobile (iOS, Android, web) per la **gestione del prato e dei prodotti per il verde**: catalogo prodotti agronomici, dosi in base ai mq, meteo agronomico, ordini e lista fitofarmaci. Brand: **Sinelica Digital**.

- **Nome prodotto:** TurfManager  
- **Sottotitolo / partner:** SINELICA DIGITAL  
- **Tipo:** App Expo (React Native) con backend Supabase  
- **Target:** utenti che gestiscono prato/giardino (hobbisti, giardinieri) e vogliono dosi corrette, meteo e ordini senza prezzi né codici sconto  

---

## 2. Stack tecnologico

- **Frontend:** React Native + Expo (SDK ~54), React 19  
- **Backend / DB:** Supabase (auth, database, storage)  
- **Meteo:** OpenWeatherMap API (temperatura, condizioni, consigli agronomici)  
- **Storage locale:** AsyncStorage (preferiti, mq, device_id)  
- **Stampa / condivisione:** expo-print, expo-sharing (PDF lista ordine)  
- **UI:** componenti React Native (SafeAreaView, FlatList, Modal, ScrollView), icone Ionicons, tema custom  

---

## 3. Funzionalità principali

### 3.1 Catalogo prodotti

- **Fonte dati:** tabella Supabase `Prodotti` (nome, marca, categoria, descrizione, composizione, dose_radicale, dose_fogliare, unita_misura, periodo_uso, ecc.).
- **Lista principale:** prodotti “normali” (concimi, sementi, stimolanti, ecc.); i fitofarmaci (fungicidi, diserbanti, insetticidi) sono esclusi dalla lista principale e accessibili solo dalla sezione dedicata.
- **Filtri:**
  - **Marche:** chip orizzontali (TUTTI + marche con almeno un prodotto nella categoria selezionata; le marche solo-fitofarmaci non compaiono).
  - **Categorie:** seconda riga di chip (solo categorie non-farmacia: concimi, sementi, ecc.).
- **Ricerca:** campo “Cerca prodotto…” con evidenziazione del termine nei risultati (nome, descrizione, composizione, categoria).
- **Card prodotto:** marca, nome, categoria (con colore per tipo), periodo uso; pulsanti cuore (preferiti), flask (aggiungi al mix), carrello (aggiungi all’ordine).

### 3.2 Dosi in base ai mq

- **Campo MQ:** in scheda prodotto e nel modal “Trattamento Tecnico” (mix) l’utente inserisce i mq da trattare.
- **Calcolo:** per ogni prodotto vengono calcolate le quantità **radicale** e **fogliare** in base a `dose_radicale`, `dose_fogliare` e unità (ml/L o g/kg); risultati mostrati in ml o Kg.
- **Nessun prezzo:** nessun importo € mostrato; solo quantità e unità.

### 3.3 Meteo agronomico

- **Dati:** OpenWeatherMap per la città impostata dall’utente.
- **Card in header:** temperatura, condizioni (sole/pioggia/nuvoloso), nome città.
- **Consigli:** messaggio contestuale in base a stagione e meteo, ad es.:
  - Riposo invernale (Dic–Feb, neve, ≤5°C)
  - Pioggia (spegnere irrigazione, no trattamenti)
  - Bassa crescita (5–12°C, taglio alto)
  - Stress termico (≥28°C, irrigare al mattino, alzare taglio)
  - Tempo ideale (ottimo per taglio e concime)

### 3.4 Fitofarmaci (SOS / Farmacia)

- **Accesso:** icona medkit in alto a destra nell’header (accanto a cuore, impostazioni, disclaimer).
- **Modal dedicato:** lista solo prodotti con categoria fungicida, diserbante, insetticida (anche varianti BIO, PFnPE); ricerca interna; avviso su uso cautelativo e schede di sicurezza.
- **Comportamento:** tap su un prodotto apre la scheda dettaglio con dosi per mq, come per gli altri prodotti; si possono aggiungere al mix o all’ordine.

### 3.5 Preferiti

- **Icona:** cuore in header (accanto a medkit, impostazioni, disclaimer).
- **Salvataggio:** lista ID preferiti in AsyncStorage; persistenza tra sessioni.
- **Modal:** “I MIEI PREFERITI” con lista prodotti preferiti; stessi pulsanti mix/carrello e apertura scheda prodotto.

### 3.6 Mix (Trattamento tecnico)

- **Aggiunta:** pulsante flask sulle card prodotto; stesso prodotto può essere nel mix e nel carrello.
- **Bottom bar:** pulsante “MIX (n)” visibile solo se ci sono prodotti nel mix.
- **Modal “Trattamento Tecnico”:** area totale in mq; per ogni prodotto nel mix: dosi radicale/fogliare calcolate per quei mq; avviso se si mischiano solo radicali con solo fogliari; possibilità di rimuovere dal mix.

### 3.7 Ordine / Carrello

- **Aggiunta:** pulsante carrello sulle card; quantità modificabile nel modal ordine.
- **Bottom bar:** pulsante “ORDINE (n)” visibile solo se il carrello non è vuoto.
- **Modal “Ordine prodotti”:** intestazione ordine (es. nome cliente); lista prodotti con quantità e unità (L/Kg); **nessun prezzo**; pulsante **“INVIA PDF”** che genera un PDF (lista ordine con prodotto + quantità) e lo condivide (expo-print + expo-sharing).

### 3.8 Impostazioni

- **Icona:** ingranaggio in header.
- **Contenuto:** solo “Impostazioni meteo” – campo **Città o CAP** e pulsante “AGGIORNA METEO”; aggiorna città e richiama il meteo; salvataggio su Supabase (`profili_anonimi`) e in locale.

### 3.9 Disclaimer

- **Icona:** cerchio con punto esclamativo in header.
- **Contenuto:** testo legale su uso informativo dell’app, responsabilità dell’utente, prodotti fitosanitari e DPI; nessun riferimento a “assistente AI” (funzione AI rimossa).

---

## 4. Struttura dell’interfaccia

- **Header (sempre visibile):**
  - Sinistra: logo Sinelica + “TurfManager” + “SINELICA DIGITAL” (allineati a sinistra).
  - Destra: cuore (preferiti), medkit (fitofarmaci), impostazioni, disclaimer (icone grigio scuro #333).
- **Sotto l’header:** card meteo (città, temperatura, condizione, consiglio).
- **Sotto il meteo:** barra di ricerca “Cerca prodotto…”.
- **Sotto la ricerca:** due righe di chip – prima le marche, poi le categorie (senza chip “PREFERITI” o “FITOFARMACI” nei filtri).
- **Area centrale:** FlatList di card prodotto (scroll infinito).
- **Bottom bar (solo se serve):** MIX (n) e/o ORDINE (n); **nessun pulsante SOS** in basso.

Modali principali: Scheda prodotto (dettaglio + mq + dosi), Trattamento Tecnico (mix), Ordine prodotti (carrello + INVIA PDF), Preferiti, Fitofarmaci (lista + ricerca), Impostazioni meteo, Disclaimer.

---

## 5. Dati e persistenza

- **Supabase:**  
  - `Prodotti`: catalogo (marca, nome, categoria, descrizione, composizione, dose_radicale, dose_fogliare, unita_misura, periodo_uso, ecc.).  
  - `profili_anonimi`: device_id, citta_base, mq_prato_default, tipo_utente, ultimo_accesso, ultimo_mq_usato (profilo anonimo per meteo e mq).  
  - `tracking_eventi`: device_id, tipo_azione, dettaglio, valore_numerico (analytics leggero).
- **AsyncStorage:** DEVICE_ID, LAWN_SIZE, FAVS (lista ID preferiti), HAS_PROFILE_DATA (se usato).
- **Nessun prezzo né codice sconto in app:** nessuna tabella listini/agenti/partner in uso nell’UI attuale.

---

## 6. Flusso utente tipico

1. Apertura app → caricamento dati (Prodotti, profilo se presente) → vista principale con meteo (se città impostata), ricerca e filtri.
2. Impostare/aggiornare città da Impostazioni → meteo aggiornato.
3. Filtrare per marca/categoria e/o cercare → scegliere prodotti, aggiungere a preferiti, al mix e/o all’ordine.
4. Aprire scheda prodotto → inserire mq → vedere dosi radicale/fogliare.
5. Aprire Fitofarmaci (icona medkit) per cercare e usare fungicidi/diserbanti/insetticidi.
6. Dal mix: vedere “Trattamento Tecnico” con dosi per mq; eventuale stampa/condivisione esterna (non PDF ordine).
7. Dall’ordine: compilare intestazione, quantità → “INVIA PDF” per generare e condividere il PDF lista ordine (senza prezzi).

---

## 7. Brand e asset

- **Nome app:** TurfManager.  
- **Partner:** Sinelica Digital (logo in header e in splash).  
- **Splash screen:** logo Sinelica (assets/logo.png) su sfondo bianco.  
- **Tema:** verde (#1B5E20, #00C853), blu (#1A237E), grigio, rosso per pericolo/avvisi; card bianche, sfondo #F5F7FA.

---

## 8. Cosa non c’è (per chiarezza con Gemini)

- Nessuna sezione “rappresentanti” o “agenti”.
- Nessuna diagnosi AI da foto.
- Nessun prezzo, totale, codice sconto o listino partner in UI.
- Nessuna schermata “Entra nello shop” né modale iniziale “Hobbista/Giardiniere”.
- SOS/fitofarmaci solo come icona in header e relativo modal, non in basso né tra i chip marche.

Questa descrizione può essere fornita a Gemini per contestualizzare l’app TurfManager (Sinelica Digital) in modo preciso e completo.
