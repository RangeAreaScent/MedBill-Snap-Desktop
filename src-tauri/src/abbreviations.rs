//! U.S. clinical / billing abbreviation expansion for MedBill search.
//! Ported from the HCPCS Snap desktop dictionary; covers POS, HCPCS
//! modifier, MS-DRG name, and ICD diagnosis text alike.
//!
//! Two layers:
//!   1. HCPCS / billing-side abbreviations (DME, CPAP, AFO, NEMT, ABN, ...)
//!      whose expansions appear in the bundled `medbill_v1.sqlite`
//!      description / name columns.
//!   2. The full ICD Snap clinical dictionary (HTN, T2DM, COPD, ...) — a
//!      biller searching "AKI heart failure" wants the I50.9 → DRG 291/292/293
//!      routing surface and the N17.x CC entries to match.

/// (abbreviation, expansion) pairs. Lookup keys are uppercased.
const DICTIONARY: &[(&str, &str)] = &[
    // ============================================================
    // HCPCS-side additions (curated against July 2026 ANWEB)
    // ============================================================

    // Durable Medical Equipment family
    ("DME", "durable medical equipment"),
    ("DMEPOS", "prosthetic"),
    ("CPAP", "continuous positive airway"),
    ("BIPAP", "bi-level"),
    ("TENS", "transcutaneous electrical"),
    ("NPWT", "negative pressure wound"),
    ("AED", "automated external defibrillator"),
    ("CGM", "continuous glucose"),
    // Orthotics / Prosthetics
    ("AFO", "ankle foot orth"),
    ("AKA", "above knee"),
    ("BKA", "below knee"),
    // Drug administration (J-codes)
    ("IV", "intravenous"),
    ("PEN", "parenteral"),
    ("NOC", "not otherwise classified"),
    // Transport (A-codes)
    ("NEMT", "non-emergency transportation"),
    // Therapy services
    ("PT", "physical therapy"),
    ("OT", "occupational therapy"),
    ("SLP", "speech-language"),
    // Lab / imaging
    ("ECG", "electrocardiogram"),
    ("EKG", "electrocardiogram"),
    ("RBC", "red blood cell"),
    ("WBC", "white blood cell"),
    // ============================================================
    // ICD-side dictionary (shared audience — diagnosis searches)
    // ============================================================

    // Cardiovascular
    ("HTN", "hypertension"),
    ("HBP", "hypertension"),
    ("CAD", "coronary artery"),
    ("CHD", "coronary heart"),
    ("CHF", "heart failure"),
    ("HFREF", "heart failure reduced ejection"),
    ("HFPEF", "heart failure preserved ejection"),
    ("MI", "myocardial infarction"),
    ("STEMI", "ST elevation myocardial infarction"),
    ("NSTEMI", "non-ST elevation myocardial infarction"),
    ("AFIB", "atrial fibrillation"),
    ("AF", "atrial fibrillation"),
    ("AFL", "atrial flutter"),
    ("SVT", "supraventricular tachycardia"),
    ("VT", "ventricular tachycardia"),
    ("VF", "ventricular fibrillation"),
    ("PVC", "premature ventricular"),
    ("LBBB", "left bundle-branch block"),
    ("RBBB", "right bundle-branch block"),
    ("AAA", "abdominal aortic aneurysm"),
    ("DVT", "deep vein thrombosis"),
    ("PE", "pulmonary embolism"),
    ("VTE", "venous thromboembolism"),
    ("PVD", "peripheral vascular disease"),
    ("PAD", "peripheral vascular disease"),
    ("CVA", "cerebral infarction"),
    ("TIA", "transient ischemic attack"),
    // Endocrine
    ("DM", "diabetes mellitus"),
    ("T1DM", "type 1 diabetes mellitus"),
    ("T2DM", "type 2 diabetes mellitus"),
    ("IDDM", "type 1 diabetes mellitus"),
    ("NIDDM", "type 2 diabetes mellitus"),
    ("DKA", "diabetes ketoacidosis"),
    ("HHS", "hyperosmolarity"),
    ("HLD", "hyperlipidemia"),
    ("DLD", "hyperlipidemia"),
    ("TSH", "hypothyroidism"),
    ("PCOS", "polycystic ovarian syndrome"),
    // Pulmonary
    ("COPD", "chronic obstructive pulmonary"),
    ("OSA", "sleep apnea"),
    ("URI", "acute upper respiratory infection"),
    ("LRI", "lower respiratory"),
    ("RAD", "asthma"),
    ("PNA", "pneumonia"),
    ("CAP", "pneumonia"),
    ("HAP", "pneumonia"),
    ("VAP", "ventilator associated pneumonia"),
    ("ARDS", "acute respiratory distress"),
    ("BPD", "bronchopulmonary dysplasia"),
    ("CF", "cystic fibrosis"),
    ("TB", "tuberculosis"),
    // GI / GU
    ("GERD", "gastro-esophageal reflux"),
    ("PUD", "peptic ulcer"),
    ("IBS", "irritable bowel syndrome"),
    ("IBD", "inflammatory bowel"),
    ("UC", "ulcerative colitis"),
    ("NAFLD", "fatty (change of) liver"),
    ("NASH", "nonalcoholic steatohepatitis"),
    ("ALD", "alcoholic liver"),
    ("ESLD", "end stage liver"),
    ("CDI", "Clostridium difficile"),
    ("UTI", "urinary tract infection"),
    ("BPH", "enlarged prostate"),
    ("ED", "erectile dysfunction"),
    ("CKD", "chronic kidney disease"),
    ("ESRD", "end stage renal"),
    ("AKI", "acute kidney failure"),
    // Neuro / Psych
    ("AD", "Alzheimer"),
    ("ADRD", "dementia"),
    ("PD", "Parkinson"),
    ("MS", "multiple sclerosis"),
    ("ALS", "amyotrophic lateral sclerosis"),
    ("TBI", "traumatic brain injury"),
    ("SCI", "spinal cord injury"),
    ("SAH", "subarachnoid hemorrhage"),
    ("ICH", "intracerebral hemorrhage"),
    ("ADHD", "attention-deficit hyperactivity"),
    ("ASD", "autistic disorder"),
    ("OCD", "obsessive-compulsive"),
    ("PTSD", "post-traumatic stress"),
    ("MDD", "major depressive"),
    ("GAD", "generalized anxiety"),
    ("BD", "bipolar disorder"),
    ("SUD", "substance use"),
    ("AUD", "alcohol use disorder"),
    ("OUD", "opioid use disorder"),
    ("TUD", "tobacco use"),
    // Musculoskeletal
    ("OA", "osteoarthritis"),
    ("RA", "rheumatoid arthritis"),
    ("JIA", "juvenile rheumatoid"),
    ("PSA", "psoriatic arthritis"),
    ("AS", "ankylosing spondylitis"),
    ("SLE", "systemic lupus"),
    ("PMR", "polymyalgia rheumatica"),
    ("GCA", "giant cell arteritis"),
    ("DJD", "degeneration"),
    ("LBP", "low back pain"),
    ("ACL", "anterior cruciate ligament"),
    ("PCL", "posterior cruciate ligament"),
    ("RTC", "rotator cuff"),
    // Infectious
    ("HIV", "human immunodeficiency virus"),
    ("AIDS", "human immunodeficiency virus"),
    ("HBV", "hepatitis B"),
    ("HCV", "hepatitis C"),
    ("HSV", "herpes simplex"),
    ("VZV", "varicella"),
    ("HPV", "human papillomavirus"),
    ("CMV", "cytomegaloviral"),
    ("EBV", "Epstein-Barr"),
    ("MRSA", "Methicillin resistant Staphylococcus aureus"),
    ("VRE", "vancomycin-resistant enterococcus"),
    ("GBS", "streptococcus, group B"),
    ("STD", "sexually transmitted"),
    ("STI", "sexually transmitted"),
    // Heme / Onc
    ("AML", "acute myeloid leukemia"),
    ("CML", "chronic myeloid leukemia"),
    ("ALL", "acute lymphoblastic"),
    ("CLL", "chronic lymphocytic leukemia"),
    ("MM", "multiple myeloma"),
    ("NHL", "non-Hodgkin lymphoma"),
    ("HL", "Hodgkin lymphoma"),
    ("MGUS", "monoclonal gammopathy"),
    ("ITP", "idiopathic thrombocytopenic"),
    ("DIC", "disseminated intravascular coagulation"),
    ("SCD", "sickle-cell"),
    ("IDA", "iron deficiency anemia"),
    // OB / GYN
    ("PCOD", "polycystic ovarian syndrome"),
    ("PID", "pelvic inflammatory disease"),
    ("PROM", "premature rupture of membranes"),
    ("GDM", "gestational diabetes"),
    ("HG", "hyperemesis gravidarum"),
    ("PPH", "postpartum hemorrhage"),
    ("IUGR", "intrauterine growth"),
    // Ophtho / ENT
    ("AMD", "macular degeneration"),
    ("POAG", "primary open-angle glaucoma"),
    ("DR", "diabetic retinopathy"),
    ("AOM", "otitis media"),
    ("CSOM", "suppurative otitis media"),
    ("BPPV", "benign paroxysmal positional vertigo"),
    // Dermatology / Other
    ("BCC", "basal cell carcinoma"),
    ("SCC", "squamous cell carcinoma"),
    ("AK", "actinic keratosis"),
    ("OSAS", "sleep apnea"),
    // Symptoms commonly used as search terms
    ("SOB", "dyspnea"),
    ("CP", "chest pain"),
    ("NVD", "diarrhea"),
    ("HA", "headache"),
    ("FX", "fracture"),
    ("DX", "diagnosis"),
];

fn lookup(token: &str) -> Option<&'static str> {
    let key = token.to_uppercase();
    DICTIONARY
        .iter()
        .find(|(abbr, _)| *abbr == key)
        .map(|(_, phrase)| *phrase)
}

/// Expands tokens within a multi-word query. Tokens that match a known
/// abbreviation are replaced; everything else is preserved verbatim.
/// Non-alphanumeric characters are treated as token separators.
pub fn expand(query: &str) -> String {
    let tokens: Vec<&str> = query
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .collect();
    if tokens.is_empty() {
        return query.trim().to_string();
    }
    tokens
        .iter()
        .map(|t| lookup(t).unwrap_or(t).to_string())
        .collect::<Vec<_>>()
        .join(" ")
}
