import type { FacilityRow } from "../db/dao/facilities.ts";

/** Offline fallback copied from infra/seed/facilities.csv. */
export const DEMO_FACILITY_CENTRE = { lat: 25.13, lon: 85.6 } as const;

const shared = { districtCode: "227", lastConfirmedAt: null, lastNegativeAt: null } as const;

/**
 * Demonstration records, not a live directory. Evidence timestamps are null
 * because a bundled snapshot cannot establish current operating status.
 */
export const DEMO_FACILITIES: FacilityRow[] = [
  { ...shared, facilityId: "demo-nalanda-medical-college", name: "Nalanda Medical College and Hospital", type: "DH", lat: 25.1876, lon: 85.5123, capabilityLevel: 5, capabilityTags: ["EMERGENCY_24X7", "DELIVERY", "CAESAREAN", "NEWBORN_CARE", "PAEDIATRIC", "INPATIENT", "LAB_BASIC", "PHARMACY", "AMBULANCE", "ICU", "BLOOD_BANK", "OXYGEN"], phone: "06112-230100" },
  { ...shared, facilityId: "demo-sheikhpura-district-hospital", name: "Sheikhpura District Hospital", type: "SDH", lat: 25.1408, lon: 85.8476, capabilityLevel: 4, capabilityTags: ["EMERGENCY_24X7", "DELIVERY", "CAESAREAN", "PAEDIATRIC", "INPATIENT", "LAB_BASIC", "PHARMACY", "AMBULANCE", "OXYGEN"], phone: "06341-222333" },
  { ...shared, facilityId: "demo-biharsharif-sadar-hospital", name: "Biharsharif Sadar Hospital", type: "SDH", lat: 25.1985, lon: 85.5267, capabilityLevel: 4, capabilityTags: ["EMERGENCY_24X7", "DELIVERY", "CAESAREAN", "PAEDIATRIC", "INPATIENT", "LAB_BASIC", "PHARMACY", "AMBULANCE", "BLOOD_BANK"], phone: "06112-222099" },
  { ...shared, facilityId: "demo-hilsa-chc", name: "Hilsa Community Health Centre", type: "CHC", lat: 25.3021, lon: 85.2823, capabilityLevel: 3, capabilityTags: ["EMERGENCY_24X7", "DELIVERY", "PAEDIATRIC", "INPATIENT", "LAB_BASIC", "PHARMACY"], phone: "06114-233100" },
  { ...shared, facilityId: "demo-rajgir-chc", name: "Rajgir Community Health Centre", type: "CHC", lat: 25.0256, lon: 85.4189, capabilityLevel: 3, capabilityTags: ["EMERGENCY_24X7", "DELIVERY", "INPATIENT", "LAB_BASIC", "PHARMACY"], phone: "06112-255010" },
  { ...shared, facilityId: "demo-noorsarai-chc", name: "Noorsarai Community Health Centre", type: "CHC", lat: 25.1743, lon: 85.3234, capabilityLevel: 3, capabilityTags: ["EMERGENCY_24X7", "DELIVERY", "INPATIENT", "LAB_BASIC", "PHARMACY", "AMBULANCE"], phone: "06112-244300" },
  { ...shared, facilityId: "demo-islampur-phc", name: "Islampur Primary Health Centre", type: "PHC", lat: 25.1389, lon: 85.1978, capabilityLevel: 2, capabilityTags: ["DELIVERY", "LAB_BASIC", "PHARMACY", "OPD"], phone: "06112-201200" },
  { ...shared, facilityId: "demo-sarmera-phc", name: "Sarmera Primary Health Centre", type: "PHC", lat: 25.0891, lon: 85.7212, capabilityLevel: 2, capabilityTags: ["DELIVERY", "LAB_BASIC", "PHARMACY", "OPD"], phone: "06112-201300" },
  { ...shared, facilityId: "demo-rahui-phc", name: "Rahui Primary Health Centre", type: "PHC", lat: 25.2476, lon: 85.4298, capabilityLevel: 2, capabilityTags: ["DELIVERY", "LAB_BASIC", "PHARMACY", "OPD"], phone: "06112-201400" },
  { ...shared, facilityId: "demo-giriak-phc", name: "Giriak Primary Health Centre", type: "PHC", lat: 25.3034, lon: 85.6512, capabilityLevel: 2, capabilityTags: ["DELIVERY", "LAB_BASIC", "PHARMACY", "OPD"], phone: "06112-201500" },
  { ...shared, facilityId: "demo-bind-subcentre", name: "Bind Sub-Centre", type: "SUBCENTRE", lat: 25.2876, lon: 85.5789, capabilityLevel: 1, capabilityTags: ["OPD"], phone: null },
  { ...shared, facilityId: "demo-pawapuri-subcentre", name: "Pawapuri Sub-Centre", type: "SUBCENTRE", lat: 25.2212, lon: 85.5312, capabilityLevel: 1, capabilityTags: ["OPD"], phone: null },
];
