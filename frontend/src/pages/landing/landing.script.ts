// @ts-nocheck
/**
 * The landing page's original DOM script, kept verbatim apart from its
 * wrapper: the page is mounted as raw markup, so this stays imperative rather
 * than being rewritten as React state. See LandingPage.tsx.
 *
 * The one change: window/document listeners, rAF loops and timers are routed
 * through the trackers below so `initLanding()` can hand back a teardown, and
 * navigating away doesn't leave the canvas and checkout animations running.
 */
export function initLanding(): () => void {
"use strict";

var _dead = false;
var _offs: Array<() => void> = [];
var _rafIds: number[] = [];
var _timerIds: number[] = [];

function _on(target, type, fn, opts?) {
  target.addEventListener(type, fn, opts);
  _offs.push(function () { target.removeEventListener(type, fn, opts); });
}
function _raf(fn) {
  if (_dead) return 0;
  var id = requestAnimationFrame(fn);
  _rafIds.push(id);
  return id;
}
function _delay(fn, ms) {
  var id = window.setTimeout(fn, ms);
  _timerIds.push(id);
  return id;
}

var REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- hero mosaic backdrop ---------------- */
(function(){
  var c=document.getElementById('mosaic'); if(!c) return;
  var ctx=c.getContext('2d'),W=0,H=0,cells=[];
  var hues=[[27,58,30],[18,40,64],[16,50,70],[36,24,60],[12,42,44]];
  function build(){
    var d=window.devicePixelRatio||1;
    W=c.clientWidth; H=c.clientHeight;
    if(!W||!H) return;
    c.width=W*d; c.height=H*d; ctx.setTransform(d,0,0,d,0,0);
    var s=Math.max(130,Math.round(W/8)), g=12; cells=[];
    for(var y=-s;y<H+s;y+=s+g) for(var x=-s;x<W+s;x+=s+g){
      var h=hues[(Math.random()*hues.length)|0];
      cells.push({x:x,y:y,s:s,h:h[0],l:5+Math.random()*7,p:Math.random()*6.283});
    }
    draw(0);
  }
  function draw(t){
    if(!W) return;
    ctx.clearRect(0,0,W,H);
    for(var i=0;i<cells.length;i++){
      var q=cells[i], a=0.40+0.28*Math.sin(t/2800+q.p), r=20, x=q.x, y=q.y, w=q.s;
      ctx.fillStyle='hsla('+q.h+',46%,'+q.l+'%,'+a+')';
      ctx.beginPath();
      ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+w,r); ctx.arcTo(x+w,y+w,x,y+w,r);
      ctx.arcTo(x,y+w,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); ctx.fill();
    }
  }
  _on(window, 'resize',build);
  build();
  if(!REDUCE) (function loop(t){ draw(t); _raf(loop); })(0);
})();

/* ---------------- decorative QR block ---------------- */
(function(){
  var box=document.getElementById('qrbox'); if(!box) return;
  var g=[],r,c2;
  for(r=0;r<9;r++){ g[r]=[]; for(c2=0;c2<9;c2++) g[r][c2]=0; }
  function finder(r0,c0){
    for(var i=0;i<3;i++) for(var j=0;j<3;j++) g[r0+i][c0+j]=(i===0||i===2||j===0||j===2)?1:0;
    g[r0+1][c0+1]=1;
  }
  finder(0,0); finder(0,6); finder(6,0);
  var seed=7;
  function rnd(){ seed=(seed*1103515245+12345)%2147483648; return seed/2147483648; }
  for(r=0;r<9;r++) for(c2=0;c2<9;c2++){
    var inFinder=(r<3&&c2<3)||(r<3&&c2>5)||(r>5&&c2<3);
    if(!inFinder) g[r][c2]=rnd()<0.48?1:0;
  }
  var html='';
  for(r=0;r<9;r++) for(c2=0;c2<9;c2++) html+= g[r][c2] ? '<i></i>' : '<i class="o"></i>';
  box.innerHTML=html;
})();

/* ---------------- hero checkout animation ---------------- */
(function(){
  var prods=document.querySelectorAll('#prods .prod[data-i]');
  var items=[document.getElementById('ci0'),document.getElementById('ci1'),document.getElementById('ci2'),document.getElementById('ci3')];
  var totalEl=document.getElementById('total');
  var over=document.getElementById('payover');
  var done=document.getElementById('paydone');
  if(!totalEl||!over) return;
  var TOTALS=['4.50','9.00','13.50','14.58'];
  var timers=[];
  function at(ms,fn){ timers.push(_delay(fn,ms)); }
  function reset(){
    timers.forEach(clearTimeout); timers=[];
    items.forEach(function(el){ if(el) el.classList.remove('on'); });
    prods.forEach(function(p){ p.classList.remove('hit'); });
    totalEl.textContent='0.00';
    over.classList.remove('on'); done.classList.remove('on');
  }
  function ring(i){
    var p=prods[i]; if(!p) return;
    p.classList.add('hit');
    at(220,function(){ p.classList.remove('hit'); });
  }
  function cycle(){
    reset();
    [0,1,2].forEach(function(i){
      at(700+i*900, function(){
        ring(i);
        if(items[i]) items[i].classList.add('on');
        totalEl.textContent=TOTALS[i];
      });
    });
    at(3600,function(){ if(items[3]) items[3].classList.add('on'); totalEl.textContent=TOTALS[3]; });
    at(4500,function(){ over.classList.add('on'); });
    at(6600,function(){ done.classList.add('on'); });
    at(9200,cycle);
  }
  if(REDUCE){
    items.forEach(function(el){ if(el) el.classList.add('on'); });
    totalEl.textContent=TOTALS[3];
  } else {
    cycle();
  }
})();

/* ---------------- screen tabs ---------------- */
(function(){
  var tabs=document.querySelectorAll('.tab[data-shot]');
  tabs.forEach(function(t){
    t.addEventListener('click',function(){
      tabs.forEach(function(o){ o.setAttribute('aria-selected','false'); });
      t.setAttribute('aria-selected','true');
      document.querySelectorAll('.shot').forEach(function(s){ s.classList.remove('on'); });
      var target=document.getElementById(t.getAttribute('data-shot'));
      if(target){ target.classList.add('on'); target.classList.add('in'); }
    });
  });
})();

/* ---------------- scroll reveal ---------------- */
(function(){
  var els=[].slice.call(document.querySelectorAll('.reveal'));
  if(REDUCE){ els.forEach(function(e){ e.classList.add('in'); }); return; }
  var ticking=false;
  function sweep(){
    ticking=false;
    var vh=window.innerHeight||0, i=els.length;
    while(i--){
      var el=els[i];
      // reveal anything whose top has entered the viewport, or that we have scrolled past
      if(el.getBoundingClientRect().top < vh*0.92){ el.classList.add('in'); els.splice(i,1); }
    }
  }
  function onScroll(){ if(!ticking){ ticking=true; _raf(sweep); } }
  _on(window, 'scroll',onScroll,{passive:true});
  _on(window, 'resize',onScroll);
  sweep();
})();

/* ---------------- language switcher ---------------- */
var DICT = {
  hi:{
    "nav.features":"सुविधाएँ","nav.screens":"देखें","nav.how":"कैसे काम करता है","nav.faq":"सवाल","nav.cta":"मुफ़्त शुरू करें",
    "hero.eyebrow":"यूनिफाइड कॉमर्स इंजन","hero.h1a":"आपकी पूरी दुकान।","hero.h1b":"एक स्क्रीन पर।",
    "hero.sub":"काउंटर, ऑनलाइन स्टोर, भुगतान और हिसाब। एक सिस्टम, एक स्टॉक, एक लॉगिन।",
    "hero.cta1":"मुफ़्त शुरू करें","hero.cta2":"चलता हुआ देखें",
    "hero.f1":"नया हार्डवेयर नहीं","hero.f2":"मिनटों में शुरू","hero.f3":"शुरू करना मुफ़्त",
    "mock.menu":"मेन्यू","mock.cart":"कार्ट","mock.p1":"कोल्ड ब्रू","mock.p2":"क्रोसां","mock.p3":"स्पार्कलिंग","mock.p4":"माचा","mock.p5":"मफ़िन","mock.p6":"एस्प्रेसो",
    "mock.p7":"लाते","mock.p8":"कुकी","mock.order":"ऑर्डर 41","scr.cat1":"सभी","scr.cat2":"कॉफ़ी","scr.cat3":"बेकरी","scr.cat4":"ठंडा","mock.tax":"कर","mock.total":"कुल","mock.charge":"भुगतान लें","mock.scan":"स्कैन करें","mock.paid":"भुगतान हुआ",
    "rep.title":"एक टैबलेट इनकी जगह लेता है","rep.1":"बिल बुक","rep.2":"कैलकुलेटर","rep.3":"स्टॉक रजिस्टर","rep.4":"कार्ड मशीन","rep.5":"अलग वेबसाइट","rep.6":"महीने के अंत की शीट",
    "mod.eyebrow":"सब कुछ शामिल","mod.h2":"सात टूल। एक लॉगिन।","mod.lede":"यहाँ कुछ भी अलग से नहीं खरीदना पड़ता।",
    "pil.1t":"बेचें","pil.1p":"काउंटर पर और ऑनलाइन, एक ही कैटलॉग से।",
    "pil.2t":"पैसे लें","pil.2p":"तीन तरीके, हिसाब एक ही जगह।",
    "pil.3t":"बढ़ें","pil.3p":"क्या बिकता है देखें, ग्राहक क्या कहते हैं सुनें।",
    "m1.tag":"काउंटर","m1.t":"कियोस्क और POS","m1.p":"कोई भी टैबलेट काउंटर बन जाता है। प्रोडक्ट, कार्ट, चेकआउट।","m1.a":"वैरिएंट","m1.b":"कैटेगरी","m1.c":"सेल्फ़-चेकआउट",
    "m2.tag":"पैसा आना","m2.t":"भुगतान","m2.p":"डायनामिक QR, कार्ड और नेट बैंकिंग। पूरी सुरक्षा के साथ।","m2.a":"डायनामिक QR","m2.b":"कार्ड","m2.c":"नेट बैंकिंग",
    "m3.tag":"स्टॉक","m3.t":"इन्वेंटरी","m3.p":"काउंटर और वेबसाइट पर एक ही स्टॉक। खत्म होने से पहले अलर्ट।","m3.a":"कम स्टॉक अलर्ट","m3.b":"बल्क CSV इम्पोर्ट",
    "m4.tag":"ऑनलाइन","m4.t":"आपकी अपनी वेबसाइट","m4.p":"आपके अपने डोमेन पर असली स्टोर, वही एक स्टॉक।","m4.a":"कस्टम डोमेन","m4.b":"हर स्क्रीन पर","m4.c":"CSS और HTML एडिटर",
    "m5.tag":"हिसाब","m5.t":"अकाउंटिंग","m5.p":"बिक्री, खरीद और खर्च — टेबल में एक्सपोर्ट के लिए तैयार।","m5.a":"टैक्स इंजन","m5.b":"एक क्लिक एक्सपोर्ट",
    "m6.tag":"ग्राहक","m6.t":"रिव्यू और जवाब","m6.p":"सारे रिव्यू एक जगह। ऐप छोड़े बिना जवाब दें।","m6.a":"एक टैप में जवाब","m6.b":"रेटिंग इतिहास",
    "m7.tag":"जानकारी","m7.t":"अपनी दुकान से सवाल पूछें","m7.p":"जैसे बोलते हैं वैसे ही लिखिए। AI आपकी अपनी बिक्री पढ़कर सीधा जवाब देता है।","m7.q":"“वीकेंड पर सबसे ज़्यादा क्या बिकता है?”","m7.a":"कोल्ड ब्रू — शनि-रवि की 38% बिक्री।",
    "ex.1":"प्रोफ़ाइल सेटअप","ex.2":"कस्टम डोमेन","ex.3":"टैक्स इंजन","ex.4":"स्मार्ट खुलने का समय","ex.5":"कूपन, BOGO, फ्लैश सेल","ex.6":"बल्क इम्पोर्ट और एक्सपोर्ट","ex.7":"कोड एडिटर","ex.8":"हर स्क्रीन पर चले",
    "scr.eyebrow":"देखें","scr.h2":"पूरा काम बस इतना है।","scr.lede":"तीन स्क्रीन में पूरा दिन: ऑर्डर लें, पैसे लें, दिन का हिसाब पढ़ें।",
    "scr.t1":"काउंटर","scr.t2":"भुगतान","scr.t3":"दिन",
    "scr.n1":"प्रोडक्ट पर टैप करें, कार्ट में आ जाता है। वैरिएंट और कैटेगरी शामिल।",
    "scr.n2":"हर भुगतान उसी सेकंड एक ही खाते में दर्ज होता है।",
    "scr.n3":"वही आंकड़े जो आपके अकाउंटेंट को चाहिए, टेबल में एक्सपोर्ट।",
    "scr.c1":"तरीका","scr.c2":"संदर्भ","scr.c3":"राशि","scr.c4":"स्थिति",
    "scr.r1":"डायनामिक QR","scr.r2":"कार्ड","scr.r3":"नेट बैंकिंग","scr.ok":"निपटा",
    "scr.k1":"बिक्री","scr.k2":"ऑर्डर","scr.k3":"औसत बास्केट","scr.k4":"कम स्टॉक","scr.k4d":"फिर से मंगाएँ",
    "pay.eyebrow":"भुगतान और हिसाब","pay.h2":"पैसे लेने का हर तरीका।","pay.lede":"और ग्राहक के जाने से पहले हिसाब पूरा।",
    "pay.1t":"डायनामिक QR","pay.1p":"हर ऑर्डर पर नया कोड। न कुछ टाइप करना, न गलती।",
    "pay.2t":"कार्ड","pay.2p":"अपनी कार्ड मशीन के बिना, PCI-अनुरूप प्रोसेसिंग।",
    "pay.3t":"नेट बैंकिंग","pay.3p":"बड़े ऑर्डर और नियमित खातों के लिए।",
    "pay.f1":"बिक्री","pay.f2":"खरीद","pay.f3":"खर्च","pay.f4":"एक एक्सपोर्ट फ़ाइल","pay.f5":"अकाउंटेंट को दे दें, या सीधे अपने अकाउंटिंग सॉफ़्टवेयर में लोड करें।",
    "st.eyebrow":"शुरुआत","st.h2":"चार कदम में शुरू।","st.lede":"ज़्यादातर दुकानें उसी दोपहर पहला ऑर्डर ले लेती हैं।",
    "st.1t":"रजिस्टर करें","st.1p":"दुकान का नाम और ज़रूरी जानकारी। दो मिनट।",
    "st.2t":"सेटअप","st.2p":"समय, कर, भुगतान के तरीके, डोमेन।",
    "st.3t":"प्रोडक्ट जोड़ें","st.3p":"एक-एक करके, या पूरी लिस्ट फ़ाइल से।",
    "st.4t":"लाइव करें","st.4p":"काउंटर और वेबसाइट साथ खुलते हैं।",
    "ask.eyebrow":"सवाल","ask.h2":"पढ़ने की जगह पूछिए।","ask.lede":"जो सहायक आपकी बिक्री के सवालों का जवाब देता है, वही KiosCart के सवालों का भी।",
    "ask.ph":"KiosCart के बारे में कुछ भी पूछें…","ask.send":"पूछें",
    "ask.q1":"कितना खर्च आता है?","ask.q2":"क्या खास हार्डवेयर चाहिए?","ask.q3":"क्या दुकान और वेबसाइट साथ चला सकते हैं?","ask.q4":"क्या पॉप-अप के लिए ठीक है?","ask.q5":"भुगतान कितने सुरक्षित हैं?","ask.q6":"क्या दुकान का लुक बदल सकते हैं?",
    "ask.idle":"कोई सवाल चुनें, या अपना लिखें।",
    "pr.eyebrow":"भरना बाकी","pr.h2":"तीन दुकानदार, तीन वाक्य।","pr.lede":"ये खाली जगहें हैं। असली बातें नाम और फ़ोटो के साथ डालें, या तब तक यह हिस्सा हटा दें।",
    "pr.slot":"आपके दुकानदार के अपने शब्द, एक या दो वाक्य।","pr.who":"नाम · दुकान · शहर",
    "cta.h1":"अपनी दुकान खोलिए","cta.h2":"KiosCart पर।","cta.sub":"शुरू करना मुफ़्त। बड़ा होने पर हमसे बात करें।","cta.b1":"मुफ़्त शुरू करें","cta.b2":"हमसे बात करें",
    "ft.about":"काउंटर और वेबसाइट, एक ही दुकान की तरह।",
    "ft.prod":"प्रोडक्ट","ft.p1":"कियोस्क और POS","ft.p2":"भुगतान","ft.p3":"ऑनलाइन स्टोर","ft.p4":"अकाउंटिंग",
    "ft.comp":"कंपनी","ft.c1":"हमारे बारे में","ft.c2":"सवाल","ft.c3":"एडमिन","ft.c4":"एजेंट लॉगिन",
    "ft.contact":"संपर्क","ft.rights":"© 2026 KiosCart. Jicama.tech द्वारा संचालित","ft.privacy":"प्राइवेसी","ft.terms":"शर्तें"
  }
};

var ANS = {
  en:{
    cost:"Starting is free. Talk to us when you need multiple stores, a custom domain or white-label.",
    hardware:"No. The tablet or phone you already own becomes the counter.",
    both:"Yes — that is the whole point. One catalogue, one stock count, both places.",
    popup:"Yes. It was built for stalls, events and markets: power and internet are all you need.",
    secure:"Card payments run through PCI-compliant processors. Card numbers never sit on your device.",
    design:"Yes. Change the theme, connect your own domain, and take full control with the CSS/HTML editor.",
    "default":"This is a demo and only knows a few questions. The real assistant runs on your own data — write to hello@jicama.tech."
  },
  hi:{
    cost:"शुरू करना मुफ़्त है। मल्टी-स्टोर, कस्टम डोमेन या व्हाइट-लेबल चाहिए तो हमसे बात करें।",
    hardware:"नहीं। जो टैबलेट या फ़ोन आपके पास है, वही काउंटर बन जाता है।",
    both:"हाँ — यही पूरा मकसद है। एक कैटलॉग, एक स्टॉक, दोनों जगह।",
    popup:"हाँ। स्टॉल, इवेंट और मार्केट के लिए ही बना है — बिजली और इंटरनेट के अलावा कुछ नहीं चाहिए।",
    secure:"कार्ड भुगतान PCI-अनुरूप प्रोसेसर से होते हैं। कार्ड नंबर आपके डिवाइस पर कभी नहीं रहते।",
    design:"हाँ। थीम बदलें, अपना डोमेन जोड़ें, और CSS/HTML एडिटर से पूरा कंट्रोल लें।",
    "default":"यह डेमो है और कुछ ही सवालों के जवाब जानता है। असली सहायक आपके अपने डेटा पर चलता है — hello@jicama.tech पर लिखें।"
  }
};

var LANG='en';
// Shared with the React side (src/i18n) so the language a visitor picks on the
// landing page still holds when they reach the login screen or the dashboard.
var LANG_KEY='kioscart:lang';
function readStoredLang(){
  try{ var v=localStorage.getItem(LANG_KEY); return (v==='en'||v==='hi')?v:null; }catch(e){ return null; }
}
var FONTS={
  hi:'https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;600;700&display=swap'
};
var loaded={};
function loadFont(l){
  if(!FONTS[l]||loaded[l]) return;
  loaded[l]=true;
  var lk=document.createElement('link'); lk.rel='stylesheet'; lk.href=FONTS[l];
  document.head.appendChild(lk);
}

/* snapshot English straight off the DOM so we never duplicate it in JS */
DICT.en={};
document.querySelectorAll('[data-i18n]').forEach(function(el){
  DICT.en[el.getAttribute('data-i18n')]=el.innerHTML;
});
document.querySelectorAll('[data-i18n-ph]').forEach(function(el){
  DICT.en['@ph:'+el.getAttribute('data-i18n-ph')]=el.getAttribute('placeholder');
});

function apply(lang){
  var d=DICT[lang]||DICT.en, en=DICT.en;
  document.querySelectorAll('[data-i18n]').forEach(function(el){
    var k=el.getAttribute('data-i18n');
    var v=(d[k]!==undefined)?d[k]:en[k];
    if(v!==undefined) el.innerHTML=v;
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(function(el){
    var k=el.getAttribute('data-i18n-ph');
    var v=(d[k]!==undefined)?d[k]:en['@ph:'+k];
    if(v!==undefined) el.setAttribute('placeholder',v);
  });
  document.documentElement.setAttribute('lang',lang);
  LANG=lang;
  try{ localStorage.setItem(LANG_KEY,lang); }catch(e){}
  var label=document.getElementById('langlabel');
  if(label) label.textContent=lang.toUpperCase();
  document.querySelectorAll('#langmenu button').forEach(function(b){
    b.setAttribute('aria-current', b.getAttribute('data-lang')===lang ? 'true':'false');
  });
  resetAnswer();
}

(function(){
  var btn=document.getElementById('langbtn'), menu=document.getElementById('langmenu');
  if(!btn||!menu) return;
  btn.addEventListener('click',function(e){
    e.stopPropagation();
    var open=menu.classList.toggle('open');
    btn.setAttribute('aria-expanded',open?'true':'false');
  });
  _on(document, 'click',function(){ menu.classList.remove('open'); btn.setAttribute('aria-expanded','false'); });
  menu.addEventListener('click',function(e){ e.stopPropagation(); });
  menu.querySelectorAll('button').forEach(function(b){
    b.addEventListener('click',function(){
      var l=b.getAttribute('data-lang');
      loadFont(l);
      apply(l);
      menu.classList.remove('open');
      btn.setAttribute('aria-expanded','false');
    });
  });

  var stored=readStoredLang();
  if(stored && stored!=='en'){ loadFont(stored); apply(stored); }
})();

/* ---------------- ask (demo FAQ) ---------------- */
var answerEl=document.getElementById('answer');
function resetAnswer(){
  if(!answerEl) return;
  answerEl.classList.add('empty');
  var d=DICT[LANG]||DICT.en;
  answerEl.innerHTML = (d['ask.idle']!==undefined)?d['ask.idle']:DICT.en['ask.idle'];
}
(function(){
  if(!answerEl) return;
  var input=document.getElementById('askinput');
  var send=document.getElementById('asksend');
  var MATCH=[
    ['cost',/cost|price|pric|pay for|charge|fee|कितना|खर्च|कीमत|多少钱|价格|费用/i],
    ['hardware',/hardware|device|tablet|machine|हार्डवेयर|मशीन|टैबलेट|设备|硬件|平板/i],
    ['both',/both|online|website|shop and|दुकान और|वेबसाइट|ऑनलाइन|网站|线上|一起/i],
    ['popup',/pop.?up|stall|event|market|पॉप|स्टॉल|इवेंट|快闪|摊位|市集/i],
    ['secure',/secure|safe|security|pci|सुरक्ष|安全|支付安全/i],
    ['design',/design|look|theme|custom|customi|डिज़ाइन|लुक|थीम|外观|主题|设计/i]
  ];
  function reply(key){
    var a=ANS[LANG]||ANS.en;
    answerEl.classList.remove('empty');
    answerEl.textContent=a[key]||a['default'];
  }
  function ask(text){
    if(!text||!text.trim()){ resetAnswer(); return; }
    for(var i=0;i<MATCH.length;i++){ if(MATCH[i][1].test(text)) return reply(MATCH[i][0]); }
    reply('default');
  }
  document.querySelectorAll('#suggest button').forEach(function(b){
    b.addEventListener('click',function(){
      if(input) input.value=b.textContent;
      reply(b.getAttribute('data-k'));
    });
  });
  if(send) send.addEventListener('click',function(){ ask(input?input.value:''); });
  if(input) input.addEventListener('keydown',function(e){ if(e.key==='Enter') ask(input.value); });
})();



  return function teardown() {
    _dead = true;
    _offs.forEach(function (off) { off(); });
    _rafIds.forEach(function (id) { cancelAnimationFrame(id); });
    _timerIds.forEach(function (id) { clearTimeout(id); });
    _offs = []; _rafIds = []; _timerIds = [];
  };
}
