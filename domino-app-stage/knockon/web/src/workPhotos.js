// Real photographs of each kind of problem, from Wikimedia Commons, resized for this app.
// Files are in web/public/photos/<id>.jpg. Their licences require the credit shown on the Grade & suggest tab.
// They are examples of the work, not pictures of a particular repair, and the page labels them that way.
export const WORK_PHOTOS = {
  pothole: { alt: 'A deep pothole in a road in Bengaluru', author: 'Gangaasoonu', license: 'CC BY-SA 4.0', source: 'https://commons.wikimedia.org/wiki/File:Roads_deformed_T_munnekollala_Bengaluru.jpg' },
  flood: { alt: 'A flooded street in Bengaluru with vehicles in the water', author: 'Shyamal', license: 'CC BY-SA 4.0', source: 'https://commons.wikimedia.org/wiki/File:Flooding_in_Bangalore_3.jpg' },
  water_leak: { alt: 'Water across a road from a burst pipe, with traffic cones around it', author: 'Mr Ignavy', license: 'CC BY-SA 2.0', source: 'https://commons.wikimedia.org/wiki/File:Burst_pipe_-_Hawley_Lane_-_geograph.org.uk_-_7361881.jpg' },
  no_water: { alt: 'A water tanker at a roadside filling point in Bengaluru', author: 'Saiphani02', license: 'CC BY-SA 4.0', source: 'https://commons.wikimedia.org/wiki/File:Water_tanker_refilling_in_Bengaluru.jpg', position: '50% 85%' },
  sewage: { alt: 'A manhole overflowing into standing water', author: 'Stephen Craven', license: 'CC BY-SA 2.0', source: 'https://commons.wikimedia.org/wiki/File:Overflowing_manhole_by_the_railway_at_Kirkstall_-_geograph.org.uk_-_4775293.jpg' },
  power_line: { alt: 'An electric pole carrying overhead wires in India', author: 'Rajaramraok', license: 'CC BY-SA 4.0', source: 'https://commons.wikimedia.org/wiki/File:Indianelectricpole.jpg' },
  transmission: { alt: 'A high-voltage transmission tower and lines in Tamil Nadu', author: 'Mersaleashwaran', license: 'CC BY-SA 4.0', source: 'https://commons.wikimedia.org/wiki/File:Transmission_Tower_-_Erode_District_-_Tamilnadu_,_India.jpg' },
  street_light: { alt: 'A street light against the sky', author: 'Joydeep', license: 'CC BY-SA 3.0', source: 'https://commons.wikimedia.org/wiki/File:Street_light_07092012..jpg' },
  garbage: { alt: 'A heap of uncollected garbage in New Delhi', author: 'Aafi', license: 'CC BY-SA 4.0', source: 'https://commons.wikimedia.org/wiki/File:Garbage_heap_in_Batla_House,_New_Delhi,_18_June_2024.jpg' },
  fallen_tree: { alt: 'A fallen tree lying across a road in Mumbai', author: 'Rakesh from Bangalore', license: 'CC BY-SA 2.0', source: 'https://commons.wikimedia.org/wiki/File:A_Fallen_Tree_in_Kulupwadi_Rd,_Borivali_(35520292).jpg' },
  signal: { alt: 'A traffic signal at a road junction in Kerala', author: 'Ranjithsiji', license: 'CC BY-SA 4.0', source: 'https://commons.wikimedia.org/wiki/File:Vengalloor_Junction,_Thodupuzha_DSC02638_05.jpg' },
  heavy_rain: { alt: 'A road under water during heavy rain', author: 'Siddhesh Mangela', license: 'CC BY-SA 3.0', source: 'https://commons.wikimedia.org/wiki/File:Guy_in_yellow,_Having_a_Full_Joy_of_the_rain..._-_panoramio.jpg' },
  traffic: { alt: 'Heavy traffic on a wide road in Bengaluru', author: 'Divya Chinnasamy', license: 'CC0', source: 'https://commons.wikimedia.org/wiki/File:TRAFFIC_VIEW_IN_BANGALORE.jpg' },
};

// The photo that stands for each department's work.
export const DEPARTMENT_PHOTO = {
  roads: 'pothole', drains: 'flood', waste: 'garbage', lights: 'street_light', trees: 'fallen_tree',
  water: 'water_leak', power: 'power_line', kptcl: 'transmission', traffic: 'traffic', disaster: 'heavy_rain',
};

export const workPhotoUrl = (id) => `photos/${id}.jpg`;
