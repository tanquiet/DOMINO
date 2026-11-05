// Authority contact numbers, each with the page it came from (checked 5 Nov 2026).
// 'official' = shown on that body's own current site. 'older' = official but dated, or conflicting elsewhere.
// None of these numbers has been test-called. Officers' personal mobiles are left out on purpose.
export const CHECKED_ON = '5 Nov 2026';

const S = {
  fire: 'https://ksfes.karnataka.gov.in/news/Karnataka%20State%20Fire%20and%20Emergency%20Services%20(Helpline%20number:%20101%20and%20112)/en',
  fireOld: 'https://karunadu.karnataka.gov.in/English/Pages/Fire-Services.aspx',
  ksdma: 'https://ksdma.karnataka.gov.in/',
  btp: 'https://www.bangaloretrafficpolice.gov.in/complaint-sugges.html',
  bwssb: 'https://bwssb.karnataka.gov.in/page/Contact+Us/Contact+Info/en',
  bescom: 'https://bescom.karnataka.gov.in/new-page/Contact%20Us/en',
  bescomCorp: 'https://bescom.karnataka.gov.in/new-page/Contact%20Us-%20Corporate%20Office/en',
  kptcl: 'https://kptcl.karnataka.gov.in/15/contact-us/en',
  gba: 'http://www.bbmp.gov.in/',
  gbaOld: 'http://bbmp.gov.in/control-room',
  nimhans: 'https://nimhans.ac.in/contact-us/',
  jayadeva: 'https://jayadevacardiology.com/contact-us/',
  victoria: 'https://victoriahospital.karnataka.gov.in/page/Contact/en',
  victoriaOld: 'https://karunadu.karnataka.gov.in/English/Pages/Hospitals.aspx',
  bowring: 'https://karunadu.karnataka.gov.in/bmcri/Pages/Contact-Us.aspx',
  stateOld: 'https://www.karnataka.com/govt/emergency-contact-numbers-in-karnataka',
};

export const EMERGENCY = [
  { number: '112', label: 'All emergencies' },
  { number: '108', label: 'Ambulance' },
  { number: '101', label: 'Fire' },
  { number: '1070', label: 'Disaster help' },
];

export const CONTACT_GROUPS = [
  { id: 'emergency', words: 'emergency danger', title: 'Emergency', note: 'If someone is in danger, call 112 first.', items: [
    { name: 'Emergency response (Namma 112)', purpose: 'Police, fire, ambulance, any emergency', number: '112', status: 'official', source: S.fire },
    { name: 'Ambulance', purpose: 'Government ambulance', number: '108', status: 'official', source: S.btp },
    { name: 'Fire and Emergency Services', purpose: 'Fire and rescue', number: '101', status: 'official', source: S.fire },
    { name: 'Fire control room, Bengaluru', purpose: 'Control room landline', number: '080-22971500', status: 'older', source: S.fireOld },
    { name: 'State disaster helpline (KSDMA)', purpose: 'Floods and disasters, State Emergency Operation Centre', number: '1070', status: 'official', source: S.ksdma },
    { name: 'State Emergency Operation Centre', purpose: 'Landline', number: '080-22340676', status: 'official', source: S.ksdma },
    { name: 'Women helpline', purpose: 'Women in need of help', number: '1091', status: 'older', source: S.stateOld },
    { name: 'Child helpline', purpose: 'Children in need of help', number: '1098', status: 'older', source: S.stateOld },
  ] },
  { id: 'water', words: 'water sewage sewer leak', title: 'Water and sewage: BWSSB', items: [
    { name: 'BWSSB 24x7 helpline', purpose: 'No water, leaks, billing, sewage', number: '1916', status: 'official', source: S.bwssb },
    { name: 'BWSSB complaints on WhatsApp', purpose: 'Messages only, include a photo and location', whatsapp: '8762228888', status: 'official', source: S.bwssb },
    { name: 'BWSSB call centre', purpose: 'Landline', number: '080-22238888', status: 'older', source: 'https://owcv2.bwssb.gov.in/member/faq' },
    { name: 'Sewer and septic tank help', purpose: 'Safe cleaning of sewers and septic tanks', number: '14420', status: 'older', source: 'https://bwssb.karnataka.gov.in/index.php/english' },
  ] },
  { id: 'power', words: 'electricity power wire', title: 'Electricity: BESCOM and KPTCL', note: 'For a power cut or a fallen wire, call BESCOM. KPTCL runs the high-voltage network and lists no public fault line.', items: [
    { name: 'BESCOM 24x7 helpline', purpose: 'Power cuts, faults, fallen wires', number: '1912', status: 'official', source: S.bescom },
    { name: 'BESCOM on WhatsApp', purpose: 'Complaints', whatsapp: '9449844640', status: 'official', source: S.bescom },
    { name: 'BESCOM safety on WhatsApp', purpose: 'Hanging wires and other safety issues', whatsapp: '9483191212', status: 'official', source: S.bescom },
    { name: 'BESCOM safety on WhatsApp (second line)', purpose: 'Hanging wires and other safety issues', whatsapp: '9483191222', status: 'official', source: S.bescom },
    { name: 'BESCOM customer relations', purpose: 'Corporate office, K.R. Circle', number: '080-22101912', status: 'official', source: S.bescomCorp },
    { name: 'KPTCL public relations', purpose: 'Kaveri Bhavan: general and public enquiries', number: '080-22245349', status: 'official', source: S.kptcl },
    { name: 'KPTCL Director (Operations) office', purpose: 'Kaveri Bhavan: transmission operations', number: '080-22228367', status: 'official', source: S.kptcl },
    { name: 'KPTCL Managing Director office', purpose: 'Kaveri Bhavan', number: '080-22214342', status: 'official', source: S.kptcl },
  ] },
  { id: 'city', words: 'road pothole drain flood garbage light tree civic gba bbmp', title: 'Roads, drains, garbage, lights, trees: GBA / BBMP', items: [
    { name: 'GBA / BBMP helpline', purpose: 'Potholes, flooding, garbage, street lights, fallen trees', number: '1533', status: 'official', source: S.gba },
    { name: 'GBA / BBMP head office', purpose: 'Landline', number: '080-22660000', status: 'older', source: S.gbaOld },
    { name: 'Sahaaya on WhatsApp', purpose: 'Civic complaints', whatsapp: '9480685700', status: 'older', source: S.gbaOld },
  ] },
  { id: 'traffic', words: 'traffic jam signal police', title: 'Traffic: Bengaluru Traffic Police', items: [
    { name: 'Traffic helpline', purpose: 'Jams, signal faults, road blocks', number: '080-25588444', status: 'older', source: S.btp },
    { name: 'Traffic helpline (second line)', purpose: 'Jams, signal faults, road blocks', number: '080-25588555', status: 'older', source: S.btp },
    { name: 'Traffic helpline (third line)', purpose: 'Jams, signal faults, road blocks', number: '080-22943030', status: 'older', source: S.btp },
    { name: 'Traffic helpline (fourth line)', purpose: 'Jams, signal faults, road blocks', number: '080-22943131', status: 'older', source: S.btp },
  ] },
  { id: 'hospital', words: 'hospital hospitals medical doctor', title: 'Government hospitals', note: 'For an ambulance call 108 or 112. Use “Nearest hospitals” in the Settings tab for hospitals close to you.', items: [
    { name: 'Jayadeva Institute of Cardiology', purpose: 'Emergency helpline', number: '080-22977202', status: 'official', source: S.jayadeva },
    { name: 'NIMHANS', purpose: 'Exchange, ask for the department you need', number: '080-26995000', status: 'official', source: S.nimhans },
    { name: 'Victoria Hospital', purpose: 'Main line', number: '080-26701150', status: 'official', source: S.victoria },
    { name: 'Victoria Hospital', purpose: 'Medical Superintendent', number: '080-26703320', status: 'official', source: S.victoria },
    { name: 'Victoria Hospital casualty and burns', purpose: 'Casualty and burns block', number: '080-26701130', status: 'older', source: S.victoriaOld },
    { name: 'Bowring and Lady Curzon Hospital', purpose: 'Main line, no dedicated emergency line reported', number: '080-25591325', status: 'older', source: S.bowring },
  ] },
];

export const telHref = (number) => `tel:${number.replace(/[^0-9+]/g, '')}`;
export const whatsappHref = (number) => `https://wa.me/91${number}`;

export function searchContacts(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return CONTACT_GROUPS;
  return CONTACT_GROUPS.map((g) => ({ ...g, items: g.items.filter((c) => (
    `${g.words} ${c.name} ${c.purpose} ${c.number || ''} ${c.whatsapp || ''}`.toLowerCase().includes(q))) }))
    .filter((g) => g.items.length);
}

// Help desk: the question's topic says who can actually answer it.
export const HELP_TOPICS = {
  road: { label: 'Potholes or road damage', group: 'city', answer: 'GBA / BBMP handles this. Call 1533, or send a photo from Citizen alerts.' },
  flood: { label: 'Flooding or waterlogging', group: 'city', answer: 'GBA / BBMP handles drains: call 1533. If people are in danger, call 112. The state disaster helpline is 1070.' },
  rain: { label: 'Heavy rain damage', group: 'emergency', answer: 'If people are in danger, call 112. The state disaster helpline is 1070.' },
  traffic: { label: 'Heavy traffic or signals', group: 'traffic', answer: 'Bengaluru Traffic Police handles this. Their helpline is listed below. Traffic grievances can also go through 112.' },
  water: { label: 'No water, leaks or sewage', group: 'water', answer: 'BWSSB handles this. Call 1916 at any time.' },
  power: { label: 'Power cut or fallen wire', group: 'power', answer: 'BESCOM handles this. Call 1912 at any time. Stay away from any fallen wire.' },
  transmission: { label: 'High-voltage tower or line', group: 'power', answer: 'KPTCL owns these. For danger call 112, and for a fault report call BESCOM on 1912, because KPTCL lists no public fault line.' },
  hospital: { label: 'Hospitals or ambulance', group: 'hospital', answer: 'For an ambulance call 108 or 112.' },
  app: { label: 'Using this app', group: null, answer: 'See the common questions on this page.' },
};
