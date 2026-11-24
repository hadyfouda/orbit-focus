'use strict';
/* بيانات اللعبة: أنواع الكواكب، الصفات، الموسوعة، والأحداث */
window.ORBIT_DATA = (() => {
  const DIST_OPTIONS = [15, 25, 35, 45, 60];
  const ENGINE_DIST = [0, 15, 25, 35, 45, 60];
  const SECTOR = { 15: 'ألفا', 25: 'بيتا', 35: 'جاما', 45: 'دلتا', 60: 'إبسيلون' };
  const MAP_R = { 15: 56, 25: 82, 35: 106, 45: 130, 60: 153 };

  const PTYPES = {
    moon: {
      ar: 'قمر صخري', w: 3, minDist: 15, minRover: 1,
      hue: [200, 230], sat: [4, 12], light: [52, 64], shift: 0, surface: 'الغبار الرمادي',
      tiles: { empty: 7, ti: 4, cr: 2, dm: 0.4, anom: 1.6, haz: 1.5, spec: 1.2 },
      cats: { microbe: 3, fossil: 3, crystal: 1 }
    },
    ice: {
      ar: 'كوكب جليدي', w: 3, minDist: 15, minRover: 1,
      hue: [180, 210], sat: [35, 65], light: [66, 78], shift: 20, surface: 'طبقة الجليد',
      tiles: { empty: 6, ti: 2.5, cr: 4, dm: 0.5, anom: 2, haz: 2, spec: 2.4 },
      cats: { microbe: 3, flora: 2, creature: 1, fossil: 2 }
    },
    desert: {
      ar: 'كوكب صحراوي', w: 3, minDist: 15, minRover: 1,
      hue: [18, 42], sat: [50, 72], light: [50, 60], shift: -10, surface: 'الرمال',
      tiles: { empty: 6, ti: 5, cr: 2, dm: 0.5, anom: 2, haz: 2.6, spec: 1.6 },
      cats: { flora: 3, fossil: 3, creature: 2 }
    },
    ocean: {
      ar: 'كوكب محيطي', w: 2.5, minDist: 25, minRover: 1,
      hue: [195, 225], sat: [55, 75], light: [40, 50], shift: 30, surface: 'المية',
      tiles: { empty: 6, ti: 2, cr: 2.5, dm: 0.5, anom: 2, haz: 2, spec: 4 },
      cats: { creature: 4, flora: 3, microbe: 2 }
    },
    crystal: {
      ar: 'كوكب كريستالي', w: 2.5, minDist: 25, minRover: 1,
      hue: [260, 320], sat: [45, 70], light: [58, 70], shift: -40, surface: 'البلورات',
      tiles: { empty: 5, ti: 2, cr: 6, dm: 1, anom: 2, haz: 2, spec: 2 },
      cats: { crystal: 4, flora: 2, microbe: 1 }
    },
    volcanic: {
      ar: 'كوكب بركاني', w: 2, minDist: 35, minRover: 3, dmg: 2,
      hue: [2, 18], sat: [70, 85], light: [30, 40], shift: 10, surface: 'الصخور المنصهرة',
      tiles: { empty: 4, ti: 5, cr: 3, dm: 1.5, anom: 2, haz: 5, spec: 1.5 },
      cats: { microbe: 3, creature: 2, crystal: 2 }
    },
    blackhole: {
      ar: 'كوكب قرب ثقب أسود', w: 1.6, minDist: 45, minRover: 4, dmg: 2,
      hue: [250, 280], sat: [25, 40], light: [20, 28], shift: 30, surface: 'السطح المشوّه',
      tiles: { empty: 4, ti: 2, cr: 3, dm: 4, anom: 3, haz: 5, spec: 2 },
      cats: { anomaly: 3, crystal: 2, microbe: 1 }
    }
  };

  const TRAITS = {
    lowg: { ar: 'جاذبية منخفضة', fx: '+2 خطوة طاقة' },
    rich: { ar: 'غني بالمعادن', fx: 'موارد أكتر وأكبر' },
    bio: { ar: 'نشاط حيوي', fx: 'كائنات أكتر' },
    storm: { ar: 'عواصف مغناطيسية', fx: 'الرادار بيتشوش' },
    ancient: { ar: 'آثار قديمة', fx: 'ظواهر غريبة أكتر' },
    unstable: { ar: 'سطح غير مستقر', fx: 'مخاطر أكتر' }
  };

  const RARITY = [
    { en: 'COMMON', ar: 'شائع', c: '#9fb3c8' },
    { en: 'UNCOMMON', ar: 'غير شائع', c: '#5ef2a8' },
    { en: 'RARE', ar: 'نادر', c: '#4fa8ff' },
    { en: 'EPIC', ar: 'ملحمي', c: '#b57bff' },
    { en: 'LEGENDARY', ar: 'أسطوري', c: '#ffc94d' }
  ];

  const CATS = {
    flora: { ar: 'نبات فضائي', traits: ['أوراقه بتلف ناحية أي مصدر ضوء', 'بيطلع جراثيم بتنور في الضلمة', 'جذوره بتمتص المعادن من الصخر', 'بيقفل أوراقه لما يحس بحركة', 'ريحته شبه المعدن السخن', 'بيغير لونه مع حرارة الجو'] },
    creature: { ar: 'كائن', traits: ['بيتحرك في مجموعات صغيرة', 'عنده عيون كتير بتلمع', 'بيتواصل بنبضات ضوء', 'فضولي جداً وبيقرب من الروفر', 'جسمه شفاف تقريباً', 'بيطلع صوت شبه الصفير'] },
    microbe: { ar: 'كائن دقيق', traits: ['بيعيش في درجات حرارة قاسية', 'بيتغذى على الإشعاع', 'بيتكاثر بسرعة مرعبة', 'بيكوّن مستعمرات على شكل حلزون', 'بيلمع لما يتعرض للضغط', 'بيستحمل الفراغ تماماً'] },
    fossil: { ar: 'حفرية', traits: ['عمرها ملايين السنين تقريباً', 'محفوظة جوه طبقة معدنية', 'شكلها بيقول إن الكوكب كان فيه مية', 'لكائن ملوش أي شبيه معروف', 'عليها علامات زي الفقرات', 'متكلسة بمعدن بيلمع'] },
    crystal: { ar: 'بلورة حية', traits: ['بتكبر ببطء وبتغير لونها', 'بتطلع نغمة لما تلمسها', 'بتخزن الحرارة وتطلعها بالليل', 'بتتجمع في أشكال هندسية مثالية', 'جواها نبض ضوء منتظم', 'بتتفاعل مع المجال المغناطيسي'] },
    artifact: { ar: 'أثر قديم', traits: ['عليه نقوش مش مفهومة', 'مصنوع من سبيكة مش معروفة', 'بيسخن لما تقربه من الضوء', 'شكله جزء من آلة أكبر', 'بيطلع ذبذبة خفيفة', 'مفيش عليه أي خدش رغم عمره'] },
    signal: { ar: 'إشارة', traits: ['بتتكرر بنمط رياضي', 'جاية من تحت السطح', 'ترددها بيتغير مع الوقت', 'شبه نداء استغاثة قديم', 'فيها تسلسل أعداد أولية', 'بتقوى كل ما تبعد'] },
    anomaly: { ar: 'ظاهرة مكانية', traits: ['الوقت حواليها بيمشي أبطأ', 'الضوء بينحني جنبها', 'بتظهر وتختفي', 'بتشد الأجسام الصغيرة', 'بتعكس صور مش موجودة', 'الصوت جواها بيرجع قبل ما يطلع'] }
  };

  const COLORS = ['أزرق', 'بنفسجي', 'فيروزي', 'ذهبي', 'أحمر', 'أخضر', 'فضي', 'وردي'];
  const SYL = ['ka', 'vel', 'tha', 'ri', 'on', 'zu', 'mar', 'eth', 'lo', 'sy', 'qa', 'dra', 'nim', 'or', 'ex', 'ul', 'va', 'ree', 'xi', 'tor', 'sel', 'an', 'mo', 'kai', 'phi', 'rum', 'ost', 'ly', 'ze', 'gan'];

  const EMPTY_TXT = {
    moon: ['فوهة قديمة فاضية', 'غبار ناعم ومفيش حاجة', 'صخور رمادية متكسرة'],
    ice: ['جليد صافي شايف تحته الضلمة', 'شقوق جليدية فاضية', 'تلال صقيع'],
    desert: ['كثبان رملية', 'صخور متآكلة من الريح', 'سهل رملي مسطح'],
    ocean: ['مية هادية', 'جزيرة صخرية صغيرة', 'موج خفيف'],
    crystal: ['أعمدة كريستال باهتة', 'أرض زجاجية', 'غابة بلورات صغيرة'],
    volcanic: ['صخر بركاني بارد', 'رماد كثيف', 'دخان كبريت'],
    blackhole: ['أرض بتتموّج', 'سماء ملتوية', 'صمت تام']
  };
  const HAZ_TXT = {
    moon: ['انهيار صخري خبط الروفر', 'نيزك صغير وقع جنبك'],
    ice: ['الجليد اتشقق تحت العجل', 'عاصفة ثلج مفاجئة'],
    desert: ['عاصفة رملية سحبت من الدرع', 'رمال متحركة'],
    ocean: ['موجة عالية ضربت الروفر', 'تيار قوي سحب الروفر'],
    crystal: ['شظايا كريستال حادة', 'رنين بلوري عطّل الحساسات'],
    volcanic: ['حمم بركانية!', 'انفجار غاز ساخن'],
    blackhole: ['موجة جاذبية', 'تشوه زمني هز الأنظمة']
  };

  /*
    تأثيرات الأحداث:
    ti/cr/dm: موارد · shield: درع · energy: طاقة
    spec: {boost, cat} عينة للموسوعة · art: {boost, cat} أثر/إشارة للموسوعة
    reveal: n يكشف أماكن مربعات على الرادار
  */
  const EVENTS = [
    {
      id: 'pulse', types: ['ice', 'ocean', 'moon'], title: 'نبض تحت السطح',
      text: 'الرادار لقط نبض منتظم تحت {surface}… كأن في حاجة عايشة تحت.',
      a: { label: 'احفر وخد عينة', chance: 0.55, win: { spec: { boost: 1.4 } }, winTxt: 'العينة وصلت سليمة!', lose: { shield: -1 }, loseTxt: 'السطح اتشقق والروفر اتخبط.' },
      b: { label: 'سجّل الإحداثيات وامشي', win: { energy: 1 }, winTxt: 'وفّرت طاقة للمربعات الجاية.' }
    },
    {
      id: 'wreck', types: null, title: 'حطام سفينة قديمة',
      text: 'حطام سفينة مدفون نصه في {surface}. الهيكل عليه علامات احتراق.',
      a: { label: 'فتّش جوه الحطام', chance: 0.65, win: { ti: 8, dm: 1 }, winTxt: 'لقيت مخزن قطع غيار سليم.', lose: { shield: -1 }, loseTxt: 'نظام دفاع قديم لسه شغال!' },
      b: { label: 'اسحب الصندوق الأسود', win: { reveal: 3 }, winTxt: 'خريطة المسح القديمة كشفت 3 مواقع على السطح.' }
    },
    {
      id: 'crater', types: null, title: 'حفرة بتطلع إشعاع',
      text: 'حفرة عميقة بيطلع منها وهج {color} خفيف، وعداد الإشعاع بيصفّر.',
      a: { label: 'انزل بالروفر جوه الحفرة', chance: 0.5, win: { dm: 3 }, winTxt: 'جمعت مادة مظلمة نقية!', lose: { shield: -2 }, loseTxt: 'الإشعاع كان أقوى من الدرع.' },
      b: { label: 'خد قراءات من الحافة', win: { dm: 1, energy: -1 }, winTxt: 'عينة صغيرة، بس استهلكت طاقة.' }
    },
    {
      id: 'signal', types: null, title: 'إشارة راديو',
      text: 'إشارة راديو بتتكرر كل 7 ثواني من اتجاه مجهول.',
      a: { label: 'اتبع الإشارة', chance: 0.6, win: { spec: { boost: 0.8 }, reveal: 2 }, winTxt: 'الإشارة وصلتك لحاجة عايشة!', lose: { energy: -2 }, loseTxt: 'طلعت صدى طبيعي وضيّعت طاقة.' },
      b: { label: 'سجّلها في الموسوعة', win: { art: { boost: 0.5, cat: 'signal' } }, winTxt: 'الإشارة اتسجلت للتحليل.' }
    },
    {
      id: 'cave', types: ['crystal', 'ice', 'moon'], title: 'كهف بلوري',
      text: 'مدخل كهف جدرانه بتعكس كشافات الروفر بألوان غريبة.',
      a: { label: 'ادخل الكهف', chance: 0.65, win: { cr: 7 }, winTxt: 'الكهف كله كريستال طاقة!', lose: { shield: -1 }, loseTxt: 'السقف وقع جزء منه.' },
      b: { label: 'اكسر عينة من المدخل', win: { cr: 2 }, winTxt: 'عينة صغيرة وآمنة.' }
    },
    {
      id: 'creature', types: ['ocean', 'desert', 'ice', 'volcanic'], title: 'زائر فضولي',
      text: 'كائن غريب بيقرب من الروفر وبيبص للكاميرا مباشرة.',
      a: { label: 'اثبت مكانك وصوّره', chance: 0.7, win: { spec: { boost: 0.9, cat: 'creature' } }, winTxt: 'صورة واضحة! اتسجل في الموسوعة.', lose: { shield: -1 }, loseTxt: 'اتخض وهاجم العجلات.' },
      b: { label: 'ابعد بهدوء', win: { energy: 1 }, winTxt: 'مشي وراك ودلّك على ممر مختصر.' }
    },
    {
      id: 'storm', types: null, title: 'عاصفة جاية',
      text: 'الحساسات بتقول إن في عاصفة بتقرب بسرعة من ناحية الأفق.',
      a: { label: 'سابق العاصفة وامسح', chance: 0.5, win: { reveal: 3 }, winTxt: 'مسحت المنطقة قبل ما توصل!', lose: { shield: -1, energy: -1 }, loseTxt: 'العاصفة لحقتك.' },
      b: { label: 'استخبى ورا صخرة', win: { energy: -1 }, winTxt: 'عدّت على خير، بس خسرت وقت وطاقة.' }
    },
    {
      id: 'geyser', types: ['ocean', 'ice', 'volcanic'], title: 'ينبوع حار',
      text: 'ينبوع بيطلع بخار {color} كل شوية، وحواليه طبقة لزجة.',
      a: { label: 'خد عينة من المية', chance: 0.6, win: { spec: { boost: 1, cat: 'microbe' } }, winTxt: 'في حياة دقيقة جوه المية!', lose: { shield: -1 }, loseTxt: 'المية كانت حمضية.' },
      b: { label: 'قيس الحرارة بس', win: { cr: 2 }, winTxt: 'الحرارة شحنت خلية كريستال.' }
    },
    {
      id: 'monolith', types: null, ancient: true, title: 'عمود أسود',
      text: 'عمود أسود أملس واقف لوحده. عليه نقوش بتنوّر لما تقرب.',
      a: { label: 'المس اللوحة', chance: 0.35, win: { art: { boost: 2.6, cat: 'artifact' } }, winTxt: 'النقوش اتنقلت لذاكرة الروفر!', lose: { shield: -2 }, loseTxt: 'صدمة طاقة رمت الروفر لورا.' },
      b: { label: 'صوّر النقوش', win: { art: { boost: 0.6, cat: 'artifact' } }, winTxt: 'صور واضحة للنقوش.' }
    },
    {
      id: 'gravity', types: null, title: 'جيب جاذبية',
      text: 'منطقة الجاذبية فيها بتتقلب، والحصى بيطفو في الهوا.',
      a: { label: 'استغلها في قفزة', chance: 0.6, win: { energy: 3 }, winTxt: 'قفزة طويلة وفّرت طاقة كتير!', lose: { shield: -1 }, loseTxt: 'الهبوط كان عنيف.' },
      b: { label: 'لف حواليها', win: { ti: 2 }, winTxt: 'لقيت شظايا معدنية على الطرف.' }
    },
    {
      id: 'egg', types: ['desert', 'ocean', 'ice', 'volcanic'], title: 'بيضة ضخمة',
      text: 'بيضة ضخمة لونها {color} ودافية، وقشرتها بتنبض.',
      a: { label: 'افحصها بالمسبار', chance: 0.5, win: { spec: { boost: 1.6, cat: 'creature' } }, winTxt: 'سجلت بيانات كائن نادر!', lose: { shield: -1 }, loseTxt: 'الأم مكانتش بعيدة…' },
      b: { label: 'سيبها في حالها', win: { cr: 1 }, winTxt: 'قرار حكيم. لقيت كريستالة صغيرة وانت ماشي.' }
    },
    {
      id: 'meteor', types: null, title: 'نيزك ساقط',
      text: 'نيزك صغير لسه ساقط ودخانه طالع.',
      a: { label: 'اقرب قبل ما يبرد', chance: 0.55, win: { dm: 2, ti: 4 }, winTxt: 'قلبه فيه مادة مظلمة!', lose: { shield: -1 }, loseTxt: 'الحرارة سيّحت جزء من الدرع.' },
      b: { label: 'استنى يبرد', win: { ti: 3, energy: -1 }, winTxt: 'أخدت معدن آمن، بس استنيت كتير.' }
    },
    {
      id: 'probe', types: null, title: 'مسبار مهجور',
      text: 'مسبار من بعثة قديمة، وبطاريته لسه فيها شحنة.',
      a: { label: 'اشحن منه الروفر', chance: 0.8, win: { energy: 3 }, winTxt: 'شحن كامل!', lose: { energy: -1 }, loseTxt: 'البطارية سحبت منك بدل ما تشحنك.' },
      b: { label: 'فكّه قطع غيار', win: { ti: 6 }, winTxt: 'قطع تيتانيوم ممتازة.' }
    },
    {
      id: 'fog', types: ['ocean', 'ice', 'crystal'], bio: true, title: 'ضباب حي',
      text: 'ضباب أخضر بيتحرك عكس اتجاه الريح.',
      a: { label: 'ادخل جواه', chance: 0.45, win: { spec: { boost: 2, cat: 'microbe' } }, winTxt: 'الضباب نفسه كائن حي!', lose: { shield: -1, energy: -1 }, loseTxt: 'الضباب لزق في الحساسات.' },
      b: { label: 'خد عينة من الطرف', win: { spec: { boost: 0, cat: 'microbe' } }, winTxt: 'عينة صغيرة اتسجلت.' }
    },
    {
      id: 'echo', types: ['blackhole'], title: 'صدى زمني',
      text: 'ساعات الروفر بقت ماشية بالعكس، وشايف صورة الروفر نفسه قدامك.',
      a: { label: 'سجّل اللحظة', chance: 0.4, win: { art: { boost: 3, cat: 'anomaly' }, dm: 2 }, winTxt: 'سجلت ظاهرة محدش شافها قبلك!', lose: { shield: -2 }, loseTxt: 'الزمن رجع لمكانه بعنف.' },
      b: { label: 'ابعد فوراً', win: { dm: 1 }, winTxt: 'خرجت بعينة صغيرة.' }
    },
    {
      id: 'lava', types: ['volcanic'], title: 'أنبوب حمم',
      text: 'أنبوب حمم فاضي بيلمع من جوه بعروق معدن.',
      a: { label: 'ادخل الأنبوب', chance: 0.55, win: { ti: 6, cr: 3 }, winTxt: 'عروق معدن غنية!', lose: { shield: -2 }, loseTxt: 'الحمم رجعت تجري فجأة.' },
      b: { label: 'خد من المدخل', win: { ti: 3 }, winTxt: 'معدن آمن من المدخل.' }
    },
    {
      id: 'plant', types: ['desert', 'ocean', 'ice', 'crystal'], title: 'نبات بيتحرك',
      text: 'نبات بيلف ببطء ناحية كشافات الروفر.',
      a: { label: 'قرّب الكشاف أكتر', chance: 0.65, win: { spec: { boost: 1, cat: 'flora' } }, winTxt: 'فتح أوراقه بالكامل!', lose: { energy: -2 }, loseTxt: 'لف حوالين العجل وعطّلك.' },
      b: { label: 'صوّره من بعيد', win: { spec: { boost: 0, cat: 'flora' } }, winTxt: 'صورة كفاية للموسوعة.' }
    },
    {
      id: 'cache', types: null, title: 'صندوق مدفون',
      text: 'صندوق معدني عليه رموز مش مفهومة، ونصه مدفون في {surface}.',
      a: { label: 'افتحه بالقوة', chance: 0.5, win: { dm: 2, cr: 4 }, winTxt: 'كنز صغير!', lose: { shield: -1 }, loseTxt: 'كان متفخخ.' },
      b: { label: 'خده زي ما هو', win: { ti: 3, cr: 1 }, winTxt: 'هتفتحه في الورشة بعدين.' }
    }
  ];

  const FLIGHT_MSGS = [
    'الملاحة: المسار مستقر', 'شحن خلايا الروفر…', 'المسح الطيفي شغال',
    'مفيش أجسام قريبة', 'حرارة المحرك طبيعية', 'استقبال إشارة خلفية ضعيفة',
    'تصحيح بسيط في المسار', 'الدروع بتتصلح أوتوماتيك'
  ];

  return { DIST_OPTIONS, ENGINE_DIST, SECTOR, MAP_R, PTYPES, TRAITS, RARITY, CATS, COLORS, SYL, EMPTY_TXT, HAZ_TXT, EVENTS, FLIGHT_MSGS };
})();
