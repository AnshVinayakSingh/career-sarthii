const EXAMS=[
{id:'ssc-mts',n:'SSC MTS',r:1,iv:false,u:'https://ssc.gov.in'},
{id:'ssc-gd',n:'SSC GD Constable',r:1,iv:false,u:'https://ssc.gov.in'},
{id:'rrb-d',n:'RRB Group D',r:1,iv:false,u:'https://indianrailways.gov.in'},
{id:'gds',n:'India Post GDS',r:1,iv:false,u:'https://indiapostgdsonline.gov.in'},
{id:'agni',n:'Agniveer',r:1,iv:false,u:'https://joinindianarmy.nic.in'},
{id:'ssc-chsl',n:'SSC CHSL',r:2,iv:false,u:'https://ssc.gov.in'},
{id:'dp',n:'Delhi Police Constable',r:2,iv:false,u:'https://delhipolice.gov.in'},
{id:'up-police',n:'UP Police Constable',r:2,iv:false,u:'https://uppbpb.gov.in'},
{id:'rrb-ntpc',n:'RRB NTPC',r:2,iv:false,u:'https://indianrailways.gov.in'},
{id:'nda',n:'NDA',r:2,iv:true,u:'https://upsc.gov.in'},
{id:'ssc-cgl',n:'SSC CGL',r:3,iv:false,u:'https://ssc.gov.in'},
{id:'ibps-clerk',n:'IBPS Clerk',r:3,iv:false,u:'https://www.ibps.in'},
{id:'ibps-po',n:'IBPS PO',r:3,iv:true,u:'https://www.ibps.in'},
{id:'sbi-po',n:'SBI PO',r:3,iv:true,u:'https://sbi.co.in/web/careers'},
{id:'cds',n:'UPSC CDS',r:3,iv:true,u:'https://upsc.gov.in'},
{id:'upsc',n:'UPSC Civil Services',r:3,iv:true,u:'https://upsc.gov.in'},
{id:'uppsc',n:'UPPSC PCS',r:3,iv:true,u:'https://uppsc.up.nic.in'}
];
const RANK={'10':1,'12':2,'grad':3};
const examsFor=q=>EXAMS.filter(e=>e.r<=(RANK[q]||0));
const SUBJECTS=[
{id:'quant',en:'Quantitative Aptitude',hi:'मात्रात्मक योग्यता'},
{id:'reason',en:'Reasoning',hi:'तर्कशक्ति'},
{id:'eng',en:'English',hi:'अंग्रेज़ी'},
{id:'ga',en:'General Awareness',hi:'सामान्य जागरूकता'}];
const CHAPTERS=[
{id:'pct',s:'quant',en:'Percentage',hi:'प्रतिशत'},{id:'tw',s:'quant',en:'Time and Work',hi:'समय और कार्य'},{id:'pl',s:'quant',en:'Profit and Loss',hi:'लाभ और हानि'},{id:'ratio',s:'quant',en:'Ratio and Proportion',hi:'अनुपात और समानुपात'},{id:'simp',s:'quant',en:'Simplification',hi:'सरलीकरण'},
{id:'series',s:'reason',en:'Number Series',hi:'संख्या श्रृंखला'},{id:'coding',s:'reason',en:'Coding-Decoding',hi:'कोडिंग-डिकोडिंग'},{id:'analogy',s:'reason',en:'Analogy',hi:'सादृश्य'},{id:'syl',s:'reason',en:'Syllogism',hi:'न्याय निगमन'},
{id:'syn',s:'eng',en:'Synonyms',hi:'पर्यायवाची'},{id:'spell',s:'eng',en:'Spelling',hi:'वर्तनी'},{id:'err',s:'eng',en:'Error Spotting',hi:'त्रुटि पहचान'},{id:'rc',s:'eng',en:'Reading Comprehension',hi:'गद्यांश'},
{id:'polity',s:'ga',en:'Polity',hi:'राजव्यवस्था'},{id:'hist',s:'ga',en:'Modern History',hi:'आधुनिक इतिहास'},{id:'sci',s:'ga',en:'General Science',hi:'सामान्य विज्ञान'},{id:'solar',s:'ga',en:'Solar System',hi:'सौर मंडल'},{id:'geo',s:'ga',en:'Geography',hi:'भूगोल'}];
const QUESTIONS=[
{id:1,s:'quant',c:'pct',q:{en:'What is 20% of 250?',hi:'250 का 20% कितना होता है?'},o:{en:['40','50','60','75'],hi:['40','50','60','75']},a:1,x:{en:'20% means 20/100. So 20/100 x 250 = 50.',hi:'20% का मतलब 20/100। इसलिए 20/100 x 250 = 50।'}},
{id:2,s:'quant',c:'tw',q:{en:'A can finish a work in 10 days and B in 15 days. Working together, in how many days will they finish it?',hi:'A किसी काम को 10 दिन में और B 15 दिन में पूरा कर सकता है। साथ काम करें तो कितने दिन में पूरा होगा?'},o:{en:['4 days','5 days','6 days','8 days'],hi:['4 दिन','5 दिन','6 दिन','8 दिन']},a:2,x:{en:'One day work = 1/10 + 1/15 = 5/30 = 1/6. So they need 6 days.',hi:'एक दिन का काम = 1/10 + 1/15 = 5/30 = 1/6। इसलिए 6 दिन लगेंगे।'}},
{id:3,s:'quant',c:'pl',q:{en:'An article bought for Rs 400 is sold for Rs 500. What is the profit percent?',hi:'400 रुपये में खरीदी वस्तु 500 रुपये में बेची गई। लाभ प्रतिशत कितना है?'},o:{en:['15%','20%','25%','30%'],hi:['15%','20%','25%','30%']},a:2,x:{en:'Profit = 500 - 400 = 100. Profit % = 100/400 x 100 = 25%.',hi:'लाभ = 500 - 400 = 100। लाभ % = 100/400 x 100 = 25%।'}},
{id:4,s:'reason',c:'series',q:{en:'Find the next number: 2, 6, 12, 20, 30, ?',hi:'अगली संख्या ज्ञात कीजिए: 2, 6, 12, 20, 30, ?'},o:{en:['40','42','44','48'],hi:['40','42','44','48']},a:1,x:{en:'The differences are 4, 6, 8, 10, so the next difference is 12. 30 + 12 = 42.',hi:'अंतर 4, 6, 8, 10 हैं, इसलिए अगला अंतर 12 होगा। 30 + 12 = 42।'}},
{id:5,s:'reason',c:'coding',q:{en:'If CAT is coded as DBU, how is DOG coded?',hi:'यदि CAT को DBU लिखा जाता है, तो DOG को कैसे लिखा जाएगा?'},o:{en:['EPH','EOH','DPH','FPI'],hi:['EPH','EOH','DPH','FPI']},a:0,x:{en:'Each letter moves one step forward: C to D, A to B, T to U. So D to E, O to P, G to H gives EPH.',hi:'हर अक्षर एक स्थान आगे बढ़ता है: C से D, A से B, T से U। इसलिए D से E, O से P, G से H मिलकर EPH बनता है।'}},
{id:6,s:'eng',c:'syn',q:{en:"Choose the synonym of 'Abundant'.",hi:"'Abundant' का पर्यायवाची चुनिए।"},o:{en:['Scarce','Plentiful','Rare','Meagre'],hi:['Scarce','Plentiful','Rare','Meagre']},a:1,x:{en:"'Abundant' means existing in large quantity, which is the same as 'Plentiful'. The other three mean little or few.",hi:"'Abundant' का अर्थ बहुत अधिक मात्रा में होना है, जो 'Plentiful' के समान है। बाकी तीन का अर्थ कम होना है।"}},
{id:7,s:'eng',c:'spell',q:{en:'Choose the correctly spelt word.',hi:'सही वर्तनी वाला शब्द चुनिए।'},o:{en:['Accomodation','Accommodation','Acommodation','Acomodation'],hi:['Accomodation','Accommodation','Acommodation','Acomodation']},a:1,x:{en:'The correct spelling has double c and double m: Accommodation.',hi:'सही वर्तनी में double c और double m आते हैं: Accommodation।'}},
{id:8,s:'ga',c:'polity',q:{en:'Who presides over a joint sitting of the two Houses of Parliament in India?',hi:'भारत में संसद के दोनों सदनों की संयुक्त बैठक की अध्यक्षता कौन करता है?'},o:{en:['President','Vice President','Speaker of Lok Sabha','Prime Minister'],hi:['राष्ट्रपति','उपराष्ट्रपति','लोकसभा अध्यक्ष','प्रधानमंत्री']},a:2,x:{en:'Under Article 108, the Speaker of the Lok Sabha presides over a joint sitting.',hi:'अनुच्छेद 108 के अनुसार संयुक्त बैठक की अध्यक्षता लोकसभा अध्यक्ष करते हैं।'}},
{id:9,s:'ga',c:'hist',q:{en:'In which year did India become independent?',hi:'भारत किस वर्ष स्वतंत्र हुआ?'},o:{en:['1945','1947','1950','1952'],hi:['1945','1947','1950','1952']},a:1,x:{en:'India became independent on 15 August 1947. 1950 is the year the Constitution came into force.',hi:'भारत 15 अगस्त 1947 को स्वतंत्र हुआ। 1950 में संविधान लागू हुआ था।'}},
{id:10,s:'ga',c:'solar',q:{en:'Which planet is known as the Red Planet?',hi:'किस ग्रह को लाल ग्रह कहा जाता है?'},o:{en:['Venus','Jupiter','Mars','Mercury'],hi:['शुक्र','बृहस्पति','मंगल','बुध']},a:2,x:{en:'Mars looks red because of iron oxide on its surface.',hi:'मंगल की सतह पर आयरन ऑक्साइड होने के कारण वह लाल दिखता है।'}}
];
const INTERVIEW={
en:['Tell us about yourself.','Why do you want to join this service or organisation?','What do you know about the post you have applied for?','Tell us about your home district and state.','Name one current affairs issue you followed recently and give your view on it.','What are your strengths and weaknesses?','If you are posted far from home, how will you manage?'],
hi:['अपने बारे में बताइए।','आप इस सेवा या संगठन में क्यों शामिल होना चाहते हैं?','जिस पद के लिए आपने आवेदन किया है, उसके बारे में आप क्या जानते हैं?','अपने गृह जिले और राज्य के बारे में बताइए।','हाल के किसी एक करंट अफेयर्स मुद्दे का नाम बताइए और उस पर अपनी राय दीजिए।','आपकी ताकत और कमज़ोरियाँ क्या हैं?','अगर आपकी पोस्टिंग घर से दूर हो तो आप कैसे सँभालेंगे?']};
