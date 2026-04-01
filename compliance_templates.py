"""
compliance_templates.py — UK Cleaning Compliance Document Templates
Miro Partners Ltd t/a AskMiro Cleaning Services

Production-grade, legally compliant UK health & safety document templates
for commercial cleaning operations.

Legal framework references:
- Health and Safety at Work etc. Act 1974
- Management of Health and Safety at Work Regulations 1999
- Control of Substances Hazardous to Health Regulations 2002 (COSHH)
- Reporting of Injuries, Diseases and Dangerous Occurrences Regulations 2013 (RIDDOR)
- Work at Height Regulations 2005
- Personal Protective Equipment at Work Regulations 1992 (as amended 2022)
- Workplace (Health, Safety and Welfare) Regulations 1992
- Manual Handling Operations Regulations 1992 (as amended 2002)
- Provision and Use of Work Equipment Regulations 1998 (PUWER)
- Health and Safety (First-Aid) Regulations 1981

Add to api.py:
    from compliance_templates import TEMPLATES, get_template, list_templates
"""

from typing import Optional

# ---------------------------------------------------------------------------
# Company constants used across templates
# ---------------------------------------------------------------------------
COMPANY_LEGAL = "Miro Partners Ltd"
COMPANY_TRADING = "AskMiro Cleaning Services"
COMPANY_FULL = f"{COMPANY_LEGAL} t/a {COMPANY_TRADING}"

# ---------------------------------------------------------------------------
# Template category mapping
# ---------------------------------------------------------------------------
TEMPLATE_CATEGORIES = {
    "coshh_risk_assessment": "COSHH",
    "generic_cleaning_risk_assessment": "Risk Assessment",
    "method_statement_office_cleaning": "Method Statement",
    "method_statement_deep_clean": "Method Statement",
    "method_statement_kitchen_washroom": "Method Statement",
    "slips_trips_falls_risk_assessment": "Risk Assessment",
    "work_at_height_risk_assessment": "Risk Assessment",
    "lone_working_risk_assessment": "Risk Assessment",
    "chemical_safety_data_sheet": "COSHH",
    "accident_incident_report": "Incident Reporting",
    "health_and_safety_policy": "Policy",
    "induction_checklist": "Training",
    "ppe_assessment_record": "PPE",
}

# ---------------------------------------------------------------------------
# TEMPLATES dictionary — keyed by document slug
# ---------------------------------------------------------------------------
TEMPLATES = {}

# ===================================================================
# 1. COSHH RISK ASSESSMENT TEMPLATE
# ===================================================================
TEMPLATES["coshh_risk_assessment"] = f"""
================================================================================
  COSHH RISK ASSESSMENT
  {COMPANY_FULL}
================================================================================

  Document Reference:  COSHH/[REFERENCE_NUMBER]
  Assessment Date:     [ASSESSMENT_DATE]
  Review Date:         [REVIEW_DATE]
  Assessor Name:       [ASSESSOR_NAME]
  Assessor Signature:  [ASSESSOR_SIGNATURE]
  Location/Site:       [SITE_NAME_AND_ADDRESS]

  Legal Basis: Control of Substances Hazardous to Health Regulations 2002
               (as amended 2004), Regulation 6 — Assessment of risk

================================================================================
  SECTION 1 — SUBSTANCE IDENTIFICATION
================================================================================

  1.1  Product/Substance Name:       [SUBSTANCE_NAME]
  1.2  Manufacturer/Supplier:        [MANUFACTURER_NAME]
  1.3  Supplier Address:             [SUPPLIER_ADDRESS]
  1.4  Supplier Contact/Emergency:   [SUPPLIER_PHONE]
  1.5  Safety Data Sheet Reference:  [SDS_REFERENCE]
  1.6  SDS Date:                     [SDS_DATE]

================================================================================
  SECTION 2 — USE AND EXPOSURE
================================================================================

  2.1  Purpose/Use in Operations:
       [DESCRIPTION_OF_USE]
       (e.g., daily surface sanitisation, floor stripping, washroom descaling)

  2.2  Frequency of Use:             [FREQUENCY]
       (e.g., daily, weekly, monthly, as required)

  2.3  Quantity Used Per Application: [QUANTITY]
  2.4  Dilution Ratio (if applicable): [DILUTION_RATIO]
  2.5  Method of Application:        [APPLICATION_METHOD]
       (e.g., spray, mop, trigger spray, dosing system, immersion)

  2.6  Duration of Exposure Per Use:  [EXPOSURE_DURATION]
  2.7  Number of Staff Exposed:       [NUMBER_EXPOSED]

================================================================================
  SECTION 3 — HAZARD CLASSIFICATION
================================================================================

  3.1  Hazard Statements (H-codes from SDS Section 2):
       [ ] [H_CODE_1] — [HAZARD_DESCRIPTION_1]
       [ ] [H_CODE_2] — [HAZARD_DESCRIPTION_2]
       [ ] [H_CODE_3] — [HAZARD_DESCRIPTION_3]

  3.2  GHS Hazard Pictograms (tick all that apply):
       [ ] GHS05 — Corrosion (corrosive to metals, skin corrosion, serious eye damage)
       [ ] GHS06 — Skull and Crossbones (acute toxicity — fatal/toxic)
       [ ] GHS07 — Exclamation Mark (irritant, skin sensitiser, acute toxicity — harmful)
       [ ] GHS08 — Health Hazard (carcinogenicity, respiratory sensitiser, mutagenicity,
                    reproductive toxicity, STOT, aspiration hazard)
       [ ] GHS09 — Environment (hazardous to aquatic environment)
       [ ] GHS02 — Flame (flammable liquids, gases, aerosols)
       [ ] GHS04 — Gas Cylinder (gases under pressure)
       [ ] GHS01 — Exploding Bomb (explosives, self-reactive, organic peroxides)
       [ ] GHS03 — Flame Over Circle (oxidisers)

  3.3  Signal Word:  [ ] Danger   [ ] Warning   [ ] None

  3.4  Precautionary Statements (P-codes from SDS Section 2):
       [P_CODE_1] — [PRECAUTIONARY_DESCRIPTION_1]
       [P_CODE_2] — [PRECAUTIONARY_DESCRIPTION_2]
       [P_CODE_3] — [PRECAUTIONARY_DESCRIPTION_3]

  3.5  Workplace Exposure Limit (WEL) if applicable:
       8-hour TWA:  [WEL_TWA] ppm / mg/m3
       15-min STEL: [WEL_STEL] ppm / mg/m3
       (Ref: EH40 — HSE Table 1)

================================================================================
  SECTION 4 — ROUTES OF EXPOSURE
================================================================================

  Tick all routes by which exposure may occur and describe the risk:

  4.1  [ ] Inhalation (breathing in vapours, mists, dusts, fumes)
       Risk: [INHALATION_RISK_DESCRIPTION]

  4.2  [ ] Skin Contact (absorption through skin, dermatitis, chemical burns)
       Risk: [SKIN_CONTACT_RISK_DESCRIPTION]

  4.3  [ ] Eye Contact (splashes, vapour causing irritation or damage)
       Risk: [EYE_CONTACT_RISK_DESCRIPTION]

  4.4  [ ] Ingestion (accidental swallowing, hand-to-mouth transfer)
       Risk: [INGESTION_RISK_DESCRIPTION]

  4.5  [ ] Injection (e.g., high-pressure equipment — generally N/A for cleaning)
       Risk: [INJECTION_RISK_DESCRIPTION]

================================================================================
  SECTION 5 — PERSONS AT RISK
================================================================================

  Tick all categories of persons who may be exposed:

  [ ] Cleaning operatives carrying out the task
  [ ] Supervisors/team leaders overseeing the work
  [ ] Client staff and visitors in the building
  [ ] Members of the public
  [ ] Contractors and subcontractors
  [ ] Maintenance/facilities staff
  [ ] Young persons (under 18) — additional assessment required per Reg. 19
  [ ] New or expectant mothers — additional assessment required per Reg. 16
  [ ] Persons with pre-existing conditions (e.g., asthma, dermatitis, eczema)

  Specific persons/roles at risk: [SPECIFIC_PERSONS_AT_RISK]

================================================================================
  SECTION 6 — EXISTING CONTROL MEASURES
================================================================================

  6.1  Elimination/Substitution:
       [ ] Less hazardous alternative considered?  [ ] Yes  [ ] No
       If yes, details: [SUBSTITUTION_DETAILS]
       If no, justification: [NO_SUBSTITUTION_JUSTIFICATION]

  6.2  Engineering Controls:
       [ ] Local exhaust ventilation (LEV)
       [ ] Natural ventilation (windows/doors open)
       [ ] Enclosed/automated dosing system
       [ ] Mechanical ventilation
       Other: [OTHER_ENGINEERING_CONTROLS]

  6.3  Administrative/Procedural Controls:
       [ ] Written safe system of work / method statement
       [ ] Staff trained in safe use of this substance (date: [TRAINING_DATE])
       [ ] SDS available at point of use
       [ ] COSHH assessment available at point of use
       [ ] Restricted access to storage area
       [ ] Correct dilution procedures documented and followed
       [ ] Exposure time limited to [EXPOSURE_LIMIT_TIME]
       [ ] Health surveillance programme in place (if required)
       [ ] Prohibition of eating, drinking, smoking in work area
       Other: [OTHER_ADMIN_CONTROLS]

  6.4  Personal Protective Equipment (see Section 7)

================================================================================
  SECTION 7 — PERSONAL PROTECTIVE EQUIPMENT REQUIRED
================================================================================

  PPE required when handling this substance (tick all that apply):

  7.1  Hand Protection:
       [ ] Chemical-resistant gloves
       Type/Material: [GLOVE_TYPE] (e.g., nitrile, latex, PVC, neoprene)
       Standard: EN 374 / EN 388
       Breakthrough time: [BREAKTHROUGH_TIME]

  7.2  Eye/Face Protection:
       [ ] Safety goggles (EN 166)
       [ ] Face shield (EN 166)
       [ ] Safety spectacles with side shields
       Type: [EYE_PROTECTION_TYPE]

  7.3  Respiratory Protection:
       [ ] Not required under normal use conditions
       [ ] FFP2 dust mask
       [ ] FFP3 dust mask
       [ ] Half-face respirator with [FILTER_TYPE] cartridge
       [ ] Full-face respirator
       Standard: EN 149 / EN 140
       Type: [RPE_TYPE]

  7.4  Body Protection:
       [ ] Chemical-resistant apron
       [ ] Disposable overalls (Type 5/6)
       [ ] Chemical-resistant suit
       Type: [BODY_PROTECTION_TYPE]

  7.5  Foot Protection:
       [ ] Chemical-resistant boots/overshoes
       [ ] Safety footwear with slip resistance (EN ISO 20345)
       Type: [FOOT_PROTECTION_TYPE]

================================================================================
  SECTION 8 — EMERGENCY PROCEDURES
================================================================================

  8.1  SPILLAGE PROCEDURE:
       Small spill (< [SMALL_SPILL_VOLUME]):
       [SMALL_SPILL_PROCEDURE]

       Large spill (> [LARGE_SPILL_VOLUME]):
       [LARGE_SPILL_PROCEDURE]

       Spillage kit location: [SPILL_KIT_LOCATION]
       Spillage kit contents: [SPILL_KIT_CONTENTS]

  8.2  FIRST AID MEASURES:

       Inhalation:
       [FIRST_AID_INHALATION]
       (Default: Remove to fresh air. If breathing is difficult, seek medical attention.
       If not breathing, call 999 and begin CPR.)

       Skin Contact:
       [FIRST_AID_SKIN]
       (Default: Remove contaminated clothing. Wash affected area with soap and water
       for at least 15 minutes. Seek medical attention if irritation persists.)

       Eye Contact:
       [FIRST_AID_EYES]
       (Default: Rinse cautiously with water for at least 15 minutes. Remove contact
       lenses if present and easy to do. Continue rinsing. Seek immediate medical attention.)

       Ingestion:
       [FIRST_AID_INGESTION]
       (Default: Do NOT induce vomiting. Rinse mouth with water. Give water to drink if
       conscious. Call 999/111 or NHS Direct. Show SDS to paramedics.)

       Emergency Contact: 999 (emergency) / 111 (non-emergency)
       National Poisons Information Service: 0344 892 0111
       Nearest A&E: [NEAREST_AE_HOSPITAL]

  8.3  FIRE/EXPLOSION:
       [ ] Substance is flammable  [ ] Substance is not flammable
       Suitable extinguishing media: [EXTINGUISHING_MEDIA]
       Unsuitable extinguishing media: [UNSUITABLE_MEDIA]
       Special fire-fighting measures: [FIRE_MEASURES]

================================================================================
  SECTION 9 — STORAGE AND DISPOSAL
================================================================================

  9.1  Storage Requirements:
       [ ] Store in original labelled container
       [ ] Store in locked, ventilated chemical store
       [ ] Store below [MAX_TEMP] degrees Celsius
       [ ] Keep away from [INCOMPATIBLE_SUBSTANCES]
       [ ] Store away from direct sunlight
       [ ] Store at ground level (not on high shelves)
       [ ] Bunded storage required
       Storage location on site: [STORAGE_LOCATION]

  9.2  Disposal:
       [ ] Dilute to drain with copious water (if SDS permits)
       [ ] Dispose as hazardous/special waste via licensed contractor
       [ ] Return empty containers to supplier
       Waste classification code (EWC): [EWC_CODE]
       Disposal contractor: [DISPOSAL_CONTRACTOR]

  9.3  Maximum Stock Level on Site: [MAX_STOCK]

================================================================================
  SECTION 10 — RISK RATING
================================================================================

  Likelihood of Harm:             Severity of Harm:
  1 = Very unlikely               1 = Minor (first aid only)
  2 = Unlikely                    2 = Moderate (up to 3 days off work)
  3 = Possible                    3 = Serious (over 7 days off / RIDDOR)
  4 = Likely                      4 = Major (permanent disability)
  5 = Very likely / certain       5 = Fatal

  Risk Score = Likelihood x Severity

  1-4   = LOW risk    — Monitor and maintain controls
  5-9   = MEDIUM risk — Review controls, improve where reasonably practicable
  10-15 = HIGH risk   — Immediate action required, additional controls needed
  16-25 = CRITICAL    — Stop work. Do not proceed until risk is reduced

  Likelihood: [LIKELIHOOD_SCORE]   Severity: [SEVERITY_SCORE]
  RISK SCORE: [RISK_SCORE]         RISK LEVEL: [RISK_LEVEL]

  With additional controls:
  Likelihood: [RESIDUAL_LIKELIHOOD]  Severity: [RESIDUAL_SEVERITY]
  RESIDUAL RISK SCORE: [RESIDUAL_SCORE]  RESIDUAL LEVEL: [RESIDUAL_LEVEL]

================================================================================
  SECTION 11 — HEALTH SURVEILLANCE
================================================================================

  [ ] Health surveillance IS required for this substance
  [ ] Health surveillance is NOT required for this substance

  If required, type of surveillance:
  [ ] Skin checks (dermatitis monitoring)
  [ ] Lung function testing (spirometry)
  [ ] Biological monitoring
  [ ] Other: [OTHER_SURVEILLANCE]

  Frequency: [SURVEILLANCE_FREQUENCY]
  Responsible person: [SURVEILLANCE_RESPONSIBLE]

================================================================================
  SECTION 12 — MONITORING AND REVIEW
================================================================================

  This assessment must be reviewed:
  - At least annually
  - When the substance or its formulation changes
  - When the process or method of use changes
  - Following an accident, incident, or near miss involving this substance
  - When new health and safety information becomes available
  - When monitoring or health surveillance results indicate a problem
  - Following enforcement action by the HSE

  Next Review Date: [REVIEW_DATE]

================================================================================
  SECTION 13 — SIGN-OFF
================================================================================

  Assessed by:
  Name:       [ASSESSOR_NAME]
  Position:   [ASSESSOR_POSITION]
  Signature:  [ASSESSOR_SIGNATURE]
  Date:       [ASSESSMENT_DATE]

  Approved by:
  Name:       [APPROVER_NAME]
  Position:   [APPROVER_POSITION]
  Signature:  [APPROVER_SIGNATURE]
  Date:       [APPROVAL_DATE]

  Staff briefed on this assessment:

  | Name | Position | Signature | Date |
  |------|----------|-----------|------|
  | [STAFF_NAME_1] | [STAFF_POSITION_1] | [STAFF_SIGNATURE_1] | [STAFF_DATE_1] |
  | [STAFF_NAME_2] | [STAFF_POSITION_2] | [STAFF_SIGNATURE_2] | [STAFF_DATE_2] |
  | [STAFF_NAME_3] | [STAFF_POSITION_3] | [STAFF_SIGNATURE_3] | [STAFF_DATE_3] |

  Review History:

  | Review Date | Reviewer | Changes Made | Next Review |
  |-------------|----------|--------------|-------------|
  | [REVIEW_DATE_1] | [REVIEWER_1] | [CHANGES_1] | [NEXT_REVIEW_1] |
  | [REVIEW_DATE_2] | [REVIEWER_2] | [CHANGES_2] | [NEXT_REVIEW_2] |

================================================================================
  {COMPANY_FULL}
  This document is controlled. Unauthorised copying or amendment is prohibited.
  Ref: COSHH Regulations 2002, HSE INDG136 — Working with substances
  hazardous to health.
================================================================================
"""

# ===================================================================
# 2. GENERIC CLEANING RISK ASSESSMENT
# ===================================================================
TEMPLATES["generic_cleaning_risk_assessment"] = f"""
================================================================================
  GENERIC CLEANING RISK ASSESSMENT
  {COMPANY_FULL}
================================================================================

  Document Reference:  RA/GEN/[REFERENCE_NUMBER]
  Assessment Date:     [ASSESSMENT_DATE]
  Review Date:         [REVIEW_DATE]
  Assessor Name:       [ASSESSOR_NAME]
  Location/Site:       [SITE_NAME_AND_ADDRESS]
  Client Contact:      [CLIENT_CONTACT_NAME]

  Legal Basis: Management of Health and Safety at Work Regulations 1999,
               Regulation 3 — Risk Assessment
               Health and Safety at Work etc. Act 1974, Section 2

  Activity Description: [ACTIVITY_DESCRIPTION]
  (e.g., routine daily office cleaning, including vacuuming, surface wiping,
  waste removal, and washroom servicing)

================================================================================
  RISK RATING MATRIX
================================================================================

  LIKELIHOOD:                          SEVERITY:
  1 = Very unlikely                    1 = Insignificant (no injury)
  2 = Unlikely                         2 = Minor (first aid treatment)
  3 = Possible                         3 = Moderate (up to 7 days off work)
  4 = Likely                           4 = Major (over 7 days / RIDDOR reportable)
  5 = Almost certain                   5 = Catastrophic (fatality / permanent disability)

  RISK SCORE = LIKELIHOOD x SEVERITY

  |            | Insignificant | Minor | Moderate | Major | Catastrophic |
  |            |      1        |   2   |    3     |   4   |      5       |
  |------------|---------------|-------|----------|-------|--------------|
  | V.Unlikely |      1        |   2   |    3     |   4   |      5       |
  | Unlikely   |      2        |   4   |    6     |   8   |     10       |
  | Possible   |      3        |   6   |    9     |  12   |     15       |
  | Likely     |      4        |   8   |   12     |  16   |     20       |
  | A.Certain  |      5        |  10   |   15     |  20   |     25       |

  1-4   LOW      Acceptable — monitor and maintain controls
  5-9   MEDIUM   Tolerable — review controls, improve where practicable
  10-15 HIGH     Unacceptable — immediate action, additional controls required
  16-25 CRITICAL Stop work — do not proceed until risk is reduced

================================================================================
  HAZARD 1 — SLIPS, TRIPS AND FALLS
================================================================================

  Hazard Description:
  Wet floors from mopping/cleaning; trailing cables from vacuum cleaners and
  floor machines; uneven surfaces; spills; obstructions in walkways; poor
  lighting; cluttered areas; changes in floor level.

  Who Might Be Harmed:
  [ ] Cleaning operatives  [ ] Client staff  [ ] Visitors  [ ] Public
  [ ] Contractors  [ ] Other: [OTHER_PERSONS]

  Existing Control Measures:
  - Wet floor warning signs placed before mopping commences
  - Signs remain in place until floor is dry
  - Mopping carried out in sections, maintaining dry walkway
  - Cable management — cables routed to avoid walkways
  - Cleaning carried out during low-traffic periods where possible
  - Staff trained in slip prevention (date: [TRAINING_DATE])
  - Non-slip safety footwear provided and worn (EN ISO 20345)
  - Area inspected before commencing work — obstructions removed
  - Adequate lighting checked before work begins
  - Spills cleaned up immediately

  Likelihood: [L_SCORE]  Severity: [S_SCORE]  Risk Score: [RISK_SCORE]

  Additional Controls Required:
  [ADDITIONAL_CONTROLS_SLIPS]

  Residual Likelihood: [RL_SCORE]  Residual Severity: [RS_SCORE]
  Residual Risk Score: [RR_SCORE]

  Action By: [ACTION_BY]  Target Date: [TARGET_DATE]

================================================================================
  HAZARD 2 — HAZARDOUS SUBSTANCES (CHEMICALS)
================================================================================

  Hazard Description:
  Use of cleaning chemicals including detergents, disinfectants, descalers,
  bleach, degreaser, glass cleaner, and floor polish. Risk of skin irritation,
  chemical burns, eye damage, respiratory irritation, and allergic reactions.
  Mixing of incompatible chemicals (e.g., bleach and acid descaler producing
  chlorine gas).

  Who Might Be Harmed:
  [ ] Cleaning operatives  [ ] Client staff  [ ] Visitors  [ ] Public
  [ ] Persons with asthma/respiratory conditions

  Existing Control Measures:
  - Individual COSHH assessments completed for each substance
  - Safety Data Sheets available for all chemicals on site
  - Staff trained in safe handling and COSHH awareness (date: [TRAINING_DATE])
  - Chemicals used at correct dilution ratios (dosing systems where available)
  - Chemicals stored in original labelled containers
  - NEVER mix different chemicals — strict prohibition communicated to all staff
  - PPE provided and worn: chemical-resistant gloves, safety goggles/glasses
  - Chemicals stored in locked cupboard/cage when not in use
  - Less hazardous alternatives used where possible (substitution principle)
  - Emergency spillage kit available
  - Adequate ventilation maintained during use

  Likelihood: [L_SCORE]  Severity: [S_SCORE]  Risk Score: [RISK_SCORE]

  Additional Controls Required:
  [ADDITIONAL_CONTROLS_CHEMICALS]

  Residual Likelihood: [RL_SCORE]  Residual Severity: [RS_SCORE]
  Residual Risk Score: [RR_SCORE]

  Action By: [ACTION_BY]  Target Date: [TARGET_DATE]

================================================================================
  HAZARD 3 — MANUAL HANDLING
================================================================================

  Hazard Description:
  Lifting and carrying equipment, chemical containers, waste bags, and furniture.
  Pushing/pulling floor machines, trolleys, and vacuum cleaners. Repetitive
  movements (wiping, mopping). Awkward postures (bending, reaching, kneeling).

  Who Might Be Harmed:
  [ ] Cleaning operatives  [ ] Supervisors

  Existing Control Measures:
  - Manual handling training provided to all staff (date: [TRAINING_DATE])
  - Heavy items split into smaller loads where possible
  - Trolleys and wheeled equipment used to transport items
  - Chemical containers limited to 5L maximum at point of use
  - Waste bags not overfilled — maximum fill line observed
  - Correct lifting technique reinforced: bend knees, straight back, load close
  - Two-person lifts for items over 15kg
  - Mechanical aids available (trolleys, sack trucks, wheeled bins)
  - Job rotation to reduce repetitive strain
  - Mops with ergonomic handles and wringer systems to reduce twisting

  Likelihood: [L_SCORE]  Severity: [S_SCORE]  Risk Score: [RISK_SCORE]

  Additional Controls Required:
  [ADDITIONAL_CONTROLS_MANUAL_HANDLING]

  Residual Likelihood: [RL_SCORE]  Residual Severity: [RS_SCORE]
  Residual Risk Score: [RR_SCORE]

  Action By: [ACTION_BY]  Target Date: [TARGET_DATE]

================================================================================
  HAZARD 4 — ELECTRICAL HAZARDS
================================================================================

  Hazard Description:
  Use of electrical equipment including vacuum cleaners, floor polishers/
  scrubbers, steam cleaners. Risk of electric shock from damaged cables, faulty
  equipment, or wet conditions. Risk of fire from overloaded sockets.

  Who Might Be Harmed:
  [ ] Cleaning operatives  [ ] Client staff  [ ] Building occupants

  Existing Control Measures:
  - All portable electrical equipment subject to PAT testing (annual)
  - Visual inspection of cables and plugs before each use
  - Damaged equipment removed from use and labelled "DO NOT USE"
  - Equipment not used near standing water
  - RCD protection used where available
  - Cables routed to avoid damage and trip hazards
  - Equipment switched off and unplugged when not in use
  - Staff trained not to overload sockets
  - Only equipment supplied or approved by the company is used
  - Defects reported immediately to supervisor

  Likelihood: [L_SCORE]  Severity: [S_SCORE]  Risk Score: [RISK_SCORE]

  Additional Controls Required:
  [ADDITIONAL_CONTROLS_ELECTRICAL]

  Residual Likelihood: [RL_SCORE]  Residual Severity: [RS_SCORE]
  Residual Risk Score: [RR_SCORE]

  Action By: [ACTION_BY]  Target Date: [TARGET_DATE]

================================================================================
  HAZARD 5 — BIOLOGICAL HAZARDS
================================================================================

  Hazard Description:
  Exposure to bodily fluids (blood, vomit, urine, faeces) during washroom
  cleaning or incident clean-up. Sharps (needles) in waste or washrooms.
  Bacteria, viruses, and pathogens on surfaces. Legionella risk from stagnant
  water. Pest contamination.

  Who Might Be Harmed:
  [ ] Cleaning operatives  [ ] Client staff  [ ] Public

  Existing Control Measures:
  - Biohazard/bodily fluid spillage kit available on site
  - Staff trained in safe clean-up of bodily fluids (date: [TRAINING_DATE])
  - Disposable gloves (nitrile) and apron worn for washroom cleaning
  - Sharps not picked up by hand — sharps bin and grabbers provided
  - Hands washed thoroughly after removing gloves
  - Appropriate disinfectant used (BS EN 1276 / EN 14476 compliant)
  - Waste segregated: general waste, clinical/hazardous waste
  - Clinical waste disposed of via licensed contractor
  - Hepatitis B vaccination offered to at-risk staff
  - Staff instructed: if needlestick injury occurs — encourage bleeding,
    wash with soap and water, report immediately, attend A&E

  Likelihood: [L_SCORE]  Severity: [S_SCORE]  Risk Score: [RISK_SCORE]

  Additional Controls Required:
  [ADDITIONAL_CONTROLS_BIOLOGICAL]

  Residual Likelihood: [RL_SCORE]  Residual Severity: [RS_SCORE]
  Residual Risk Score: [RR_SCORE]

  Action By: [ACTION_BY]  Target Date: [TARGET_DATE]

================================================================================
  HAZARD 6 — SHARPS AND GLASS
================================================================================

  Hazard Description:
  Broken glass, needles, razor blades, or other sharp objects found during
  cleaning. Risk of cuts, puncture wounds, and infection.

  Who Might Be Harmed:
  [ ] Cleaning operatives

  Existing Control Measures:
  - Staff trained to never pick up sharps or broken glass by hand
  - Dustpan and brush used for broken glass
  - Heavy-duty gloves worn when handling waste bags
  - Sharps box available for needle disposal
  - Waste bags not compressed by hand
  - Incidents reported and recorded

  Likelihood: [L_SCORE]  Severity: [S_SCORE]  Risk Score: [RISK_SCORE]

  Additional Controls Required:
  [ADDITIONAL_CONTROLS_SHARPS]

  Residual Likelihood: [RL_SCORE]  Residual Severity: [RS_SCORE]
  Residual Risk Score: [RR_SCORE]

  Action By: [ACTION_BY]  Target Date: [TARGET_DATE]

================================================================================
  SUMMARY AND SIGN-OFF
================================================================================

  Overall Risk Rating for This Activity: [OVERALL_RISK_RATING]

  Persons consulted during this assessment:
  [CONSULTED_PERSONS]

  Assessment communicated to the following staff:

  | Name | Signature | Date |
  |------|-----------|------|
  | [NAME_1] | [SIG_1] | [DATE_1] |
  | [NAME_2] | [SIG_2] | [DATE_2] |
  | [NAME_3] | [SIG_3] | [DATE_3] |
  | [NAME_4] | [SIG_4] | [DATE_4] |

  Assessed By:
  Name:       [ASSESSOR_NAME]
  Position:   [ASSESSOR_POSITION]
  Signature:  [ASSESSOR_SIGNATURE]
  Date:       [ASSESSMENT_DATE]

  Approved By:
  Name:       [APPROVER_NAME]
  Position:   [APPROVER_POSITION]
  Signature:  [APPROVER_SIGNATURE]
  Date:       [APPROVAL_DATE]

  Review Schedule:
  - This assessment will be reviewed at least annually
  - Reviewed immediately following any accident, incident, or near miss
  - Reviewed when work methods, equipment, or chemicals change
  - Reviewed when new information from the HSE or industry becomes available

  Next Review Date: [REVIEW_DATE]

================================================================================
  {COMPANY_FULL}
  Ref: Management of Health and Safety at Work Regulations 1999, Reg. 3
  Health and Safety at Work etc. Act 1974, Sections 2 and 3
================================================================================
"""

# ===================================================================
# 3. METHOD STATEMENT — OFFICE CLEANING
# ===================================================================
TEMPLATES["method_statement_office_cleaning"] = f"""
================================================================================
  METHOD STATEMENT — OFFICE CLEANING
  Safe System of Work
  {COMPANY_FULL}
================================================================================

  Document Reference:  MS/OFF/[REFERENCE_NUMBER]
  Date Prepared:       [DATE_PREPARED]
  Prepared By:         [PREPARED_BY]
  Approved By:         [APPROVED_BY]
  Review Date:         [REVIEW_DATE]
  Site/Location:       [SITE_NAME_AND_ADDRESS]
  Client:              [CLIENT_NAME]
  Contract Reference:  [CONTRACT_REFERENCE]

================================================================================
  SECTION 1 — SCOPE OF WORK
================================================================================

  This method statement covers the safe system of work for routine daily and
  periodic office cleaning operations at the above site, including but not
  limited to:

  - Vacuuming of carpeted areas and rugs
  - Damp mopping of hard floors
  - Dusting and wiping of desks, workstations, and surfaces
  - Emptying of waste bins and recycling containers
  - Cleaning and sanitising of kitchen/tea point areas
  - Cleaning and sanitising of washroom facilities
  - Glass and mirror cleaning (internal, ground level)
  - Replenishing consumables (soap, paper towels, toilet rolls)
  - Spot cleaning of spillages and stains
  - Polishing of reception/entrance areas

  Areas Covered: [LIST_OF_AREAS]
  Hours of Work: [WORKING_HOURS]
  Frequency:     [CLEANING_FREQUENCY]

================================================================================
  SECTION 2 — PERSONNEL AND COMPETENCE
================================================================================

  Minimum Staffing:    [NUMBER_OF_STAFF] operative(s)
  Supervisor:          [SUPERVISOR_NAME]
  Operative(s):        [OPERATIVE_NAMES]

  All personnel must have completed:
  [ ] Company induction (health and safety)
  [ ] Site-specific induction
  [ ] COSHH awareness training
  [ ] Manual handling training
  [ ] Slip prevention awareness
  [ ] Fire safety and evacuation procedure for this site
  [ ] Lone working procedure (if applicable)
  [ ] BICSc Licence to Practise (recommended)

================================================================================
  SECTION 3 — EQUIPMENT AND MATERIALS
================================================================================

  Equipment:
  - Commercial upright vacuum cleaner (PAT tested, current label)
  - Flat mop system with colour-coded mop heads
  - Colour-coded microfibre cloths (as per British Cleaning Council guidance):
      RED    — washrooms, toilets, urinals
      BLUE   — general office areas, low-risk surfaces
      GREEN  — kitchen and food preparation areas
      YELLOW — clinical/isolation areas (if applicable)
  - Spray bottles (correctly labelled with product and dilution)
  - Damp dusting cloths
  - Feather duster / high-level duster with extension pole
  - Glass cleaning cloth and squeegee
  - Dustpan and brush
  - Waste bags (colour-coded as required by site waste policy)
  - Cleaning trolley / caddy
  - Wet floor warning signs (minimum 2)

  Chemicals (individual COSHH assessments held):
  - Multi-surface cleaner: [PRODUCT_NAME_1]
  - Disinfectant/sanitiser: [PRODUCT_NAME_2]
  - Glass cleaner: [PRODUCT_NAME_3]
  - Washroom cleaner: [PRODUCT_NAME_4]
  - Toilet cleaner/descaler: [PRODUCT_NAME_5]
  - Air freshener: [PRODUCT_NAME_6]
  - Floor cleaner/maintainer: [PRODUCT_NAME_7]

================================================================================
  SECTION 4 — PPE REQUIREMENTS
================================================================================

  The following PPE must be worn during cleaning operations:

  All Tasks:
  - Non-slip safety footwear (EN ISO 20345)
  - Company uniform/tabard (high visibility if in car parks/external areas)

  Chemical Handling:
  - Chemical-resistant gloves (nitrile — EN 374)
  - Safety goggles when decanting or using spray products above head height

  Washroom Cleaning:
  - Nitrile disposable gloves (changed between washrooms)
  - Disposable apron (if cleaning up bodily fluids)

  Floor Cleaning (wet):
  - Rubber-soled non-slip footwear

================================================================================
  SECTION 5 — SEQUENCE OF OPERATIONS
================================================================================

  Step 1: ARRIVAL AND PREPARATION
  -----------------------------------------------------------------------
  - Sign in at reception / use site access system
  - Collect keys and access cards as required
  - Check communication device is charged and working
  - Collect cleaning equipment and trolley from store
  - Check equipment is in good condition — report any defects
  - Review any special instructions or client requests for the day
  - Walk the area to identify any unusual hazards or obstructions

  Hazards: Unfamiliar site conditions, security risks
  Controls: Site induction completed, emergency exits identified, lone
  working procedure followed if applicable

  Step 2: HIGH-LEVEL DUSTING
  -----------------------------------------------------------------------
  - Dust high ledges, picture frames, air vents, light fittings using
    extension pole duster
  - Work from the top down — dust falls to lower surfaces
  - Do not stand on chairs, desks, or unstable surfaces
  - If height exceeds 2 metres, refer to Work at Height procedure

  Hazards: Falling objects, dust inhalation, overreaching
  Controls: Extension pole used (no climbing), damp cloth to reduce
  airborne dust, correct posture

  Step 3: SURFACE CLEANING — DESKS AND WORKSTATIONS
  -----------------------------------------------------------------------
  - Damp-dust all accessible desk surfaces with BLUE microfibre cloth
  - Spray multi-surface cleaner onto cloth, NOT directly onto surfaces
    (protects electronic equipment)
  - Clean telephones, keyboards (where included in specification)
  - Do not move personal items — clean around them
  - Do not unplug or move computer equipment

  Hazards: Chemical contact, damage to client property
  Controls: Spray onto cloth not surface, colour-coded cloths,
  staff trained in desk cleaning protocol

  Step 4: WASTE COLLECTION
  -----------------------------------------------------------------------
  - Empty all waste bins and recycling containers
  - Replace bin liners as required
  - Segregate waste according to site waste management plan
  - Do not compress waste bags by hand (sharps risk)
  - Tie bags securely and transport to waste collection point
  - Do not drag bags along the floor — use trolley

  Hazards: Sharps, heavy lifting, biological contamination
  Controls: Heavy-duty gloves available, bags not overfilled,
  trolley used, sharps procedure in place

  Step 5: VACUUMING
  -----------------------------------------------------------------------
  - Vacuum all carpeted areas, paying attention to edges and corners
  - Use crevice tool for edges and hard-to-reach areas
  - Route cable to avoid trip hazards — use cable over shoulder technique
  - Do not use vacuum with damaged cable or plug
  - Move light furniture where required (replace after)
  - Empty vacuum bag/canister when 2/3 full

  Hazards: Trips (cables), electrical, manual handling, noise, dust
  Controls: PAT tested equipment, cable management, visual inspection
  before use, ear protection if prolonged use of industrial machines

  Step 6: FLOOR CLEANING (HARD FLOORS)
  -----------------------------------------------------------------------
  - Place wet floor warning signs at all entry points to the area
  - Sweep or dust-mop hard floors to remove loose debris
  - Prepare floor cleaning solution at correct dilution
  - Mop in sections — maintain a dry walkway at all times
  - Use figure-of-eight mopping technique for efficiency
  - Change mop water when it becomes dirty
  - Allow floor to dry — do not remove warning signs until dry
  - Signs remain in place for minimum 30 minutes after mopping

  Hazards: Slips on wet floors, chemical contact, manual handling
  Controls: Wet floor signs, section mopping, correct dilution,
  non-slip footwear, gloves when handling chemicals

  Step 7: WASHROOM CLEANING
  -----------------------------------------------------------------------
  - Put on fresh nitrile gloves and use RED colour-coded cloths/mops
  - Apply washroom cleaner to toilets, urinals, and sinks
  - Clean and disinfect all touchpoints: door handles, flush handles,
    taps, light switches, hand dryer buttons
  - Clean mirrors and glass surfaces
  - Clean and mop washroom floors with disinfectant
  - Replenish soap dispensers, hand towels, toilet rolls
  - Check and clean sanitary bins (do not open/empty — specialist
    contractor responsibility)
  - Place wet floor signs
  - Remove gloves and wash hands thoroughly

  Hazards: Biological (bodily fluids), chemical (descaler, bleach),
  slips (wet floor)
  Controls: Nitrile gloves, colour-coded system, disinfectant,
  wet floor signs, hand washing, COSHH assessments

  Step 8: KITCHEN/TEA POINT CLEANING
  -----------------------------------------------------------------------
  - Use GREEN colour-coded cloths
  - Clean and sanitise worktops, sink, splashback
  - Clean exterior of microwave, kettle, toaster, fridge
  - Empty and clean drip trays
  - Sweep and mop floor
  - Empty bins and replace liners
  - Replenish dishwashing liquid and hand soap

  Hazards: Biological (food waste), chemical, slips
  Controls: Green cloths only, food-safe sanitiser, wet floor signs

  Step 9: GLASS AND MIRROR CLEANING
  -----------------------------------------------------------------------
  - Clean internal glass partitions and doors at ground level
  - Use glass cleaner sprayed onto cloth
  - Clean both sides where accessible
  - Internal windows at ground level only — external windows excluded

  Hazards: Chemical (glass cleaner), glass breakage
  Controls: Spray onto cloth, check glass integrity before cleaning

  Step 10: FINAL CHECKS AND DEPARTURE
  -----------------------------------------------------------------------
  - Walk through all cleaned areas to check quality
  - Ensure all wet floor signs are in place where required
  - Return all equipment to store — clean and stow properly
  - Lock chemical store
  - Report any defects, damage, or maintenance issues to supervisor/client
  - Sign out at reception / use site access system
  - Complete cleaning log/timesheet

  Hazards: Security, incomplete work
  Controls: Quality checklist, sign-out procedure, communication

================================================================================
  SECTION 6 — EMERGENCY PROCEDURES
================================================================================

  Fire:
  - On hearing the fire alarm, stop work immediately
  - Leave the building by the nearest safe exit
  - Do not use lifts
  - Assemble at the designated fire assembly point: [FIRE_ASSEMBLY_POINT]
  - Do not re-enter until authorised by fire warden or fire service
  - Report to site fire marshal/warden

  First Aid:
  - First aid kit location: [FIRST_AID_LOCATION]
  - Appointed first aider: [FIRST_AIDER_NAME] / [FIRST_AIDER_PHONE]
  - In an emergency call 999

  Chemical Spillage:
  - Refer to specific COSHH assessment for the substance
  - Spillage kit location: [SPILL_KIT_LOCATION]
  - Ventilate the area — open windows/doors
  - Evacuate area if large spill or toxic fumes
  - Do not mix chemicals during clean-up

  Accident/Incident:
  - All accidents and near misses must be reported to the supervisor
  - Complete the company Accident & Incident Report Form
  - RIDDOR reporting if applicable (HSE: 0345 300 9923)

================================================================================
  SECTION 7 — WASTE DISPOSAL
================================================================================

  General waste:       Black bags — to general waste skip/bin
  Mixed recycling:     Clear/blue bags — to recycling bin (per site policy)
  Confidential waste:  Site-specific procedure — do not place in general waste
  Hazardous waste:     Chemical containers returned to store/disposed via
                       licensed contractor. Never pour chemicals down the drain
                       unless SDS specifically permits dilute disposal.
  Clinical waste:      Yellow bags / sharps bins — specialist collection

  Duty of Care: Waste disposed of in compliance with Environmental Protection
  Act 1990, Section 34 (Duty of Care).

================================================================================
  SECTION 8 — SIGN-OFF
================================================================================

  I confirm that I have read and understood this method statement and will
  comply with the safe system of work described.

  Prepared By:
  Name:       [PREPARED_BY_NAME]
  Position:   [PREPARED_BY_POSITION]
  Signature:  [PREPARED_BY_SIGNATURE]
  Date:       [DATE_PREPARED]

  Approved By:
  Name:       [APPROVED_BY_NAME]
  Position:   [APPROVED_BY_POSITION]
  Signature:  [APPROVED_BY_SIGNATURE]
  Date:       [APPROVAL_DATE]

  Staff Acknowledgement:

  | Name | Signature | Date |
  |------|-----------|------|
  | [NAME_1] | [SIG_1] | [DATE_1] |
  | [NAME_2] | [SIG_2] | [DATE_2] |
  | [NAME_3] | [SIG_3] | [DATE_3] |
  | [NAME_4] | [SIG_4] | [DATE_4] |
  | [NAME_5] | [SIG_5] | [DATE_5] |

================================================================================
  {COMPANY_FULL}
  Ref: Health and Safety at Work etc. Act 1974
  Management of Health and Safety at Work Regulations 1999
  CDM Regulations 2015 (where applicable)
================================================================================
"""

# ===================================================================
# 4. METHOD STATEMENT — DEEP CLEAN
# ===================================================================
TEMPLATES["method_statement_deep_clean"] = f"""
================================================================================
  METHOD STATEMENT — DEEP CLEAN
  Safe System of Work
  {COMPANY_FULL}
================================================================================

  Document Reference:  MS/DC/[REFERENCE_NUMBER]
  Date Prepared:       [DATE_PREPARED]
  Prepared By:         [PREPARED_BY]
  Approved By:         [APPROVED_BY]
  Review Date:         [REVIEW_DATE]
  Site/Location:       [SITE_NAME_AND_ADDRESS]
  Client:              [CLIENT_NAME]
  Contract Reference:  [CONTRACT_REFERENCE]

================================================================================
  SECTION 1 — SCOPE OF WORK
================================================================================

  This method statement covers the safe system of work for deep cleaning
  operations at the above site, including but not limited to:

  - Carpet deep cleaning (hot water extraction / encapsulation)
  - Hard floor stripping, sealing, and re-coating
  - High-level cleaning (ceilings, light fittings, air vents, pipework)
  - Wall washing and spot cleaning
  - Deep cleaning of upholstered furniture
  - Intensive washroom/kitchen deep clean
  - Window cleaning (internal, ground level)
  - Behind and underneath furniture cleaning
  - Descaling of sanitary ware and fixtures
  - Grout cleaning and restoration
  - Pressure washing (external areas, if applicable)

  Areas Covered:       [LIST_OF_AREAS]
  Scheduled Date(s):   [DEEP_CLEAN_DATES]
  Working Hours:       [WORKING_HOURS]
  Duration (estimated): [ESTIMATED_DURATION]

================================================================================
  SECTION 2 — PERSONNEL AND COMPETENCE
================================================================================

  Minimum Staffing:    [NUMBER_OF_STAFF] operative(s)
  Team Leader:         [TEAM_LEADER_NAME]
  Operatives:          [OPERATIVE_NAMES]

  All personnel must have completed:
  [ ] Company health and safety induction
  [ ] Site-specific induction and access procedure
  [ ] COSHH awareness training (including specialist deep clean chemicals)
  [ ] Manual handling training
  [ ] Equipment-specific training (floor machines, extractors, pressure washers)
  [ ] Work at height training (if high-level work included)
  [ ] Lone working procedure (if applicable)
  [ ] Asbestos awareness (pre-2000 buildings)

================================================================================
  SECTION 3 — EQUIPMENT AND MATERIALS
================================================================================

  Equipment:
  - Rotary floor machine (scrubbing/buffing pads)
  - Wet/dry vacuum (water pick-up)
  - Hot water extraction machine (carpet cleaner)
  - Commercial upright and backpack vacuum cleaners
  - Flat mop system with colour-coded heads
  - Colour-coded microfibre cloths
  - Telescopic pole and attachments (high-level dusting/washing)
  - Step ladder (EN 131 compliant, max working height [MAX_HEIGHT])
  - Scraping tools and razor scrapers
  - Spray bottles, buckets, wringers
  - Wet floor warning signs (minimum 4)
  - Floor machine warning signs / barrier tape
  - Extension leads with RCD protection

  Chemicals (individual COSHH assessments held):
  - Floor stripper: [PRODUCT_NAME_1]
  - Floor sealer: [PRODUCT_NAME_2]
  - Floor polish/finish: [PRODUCT_NAME_3]
  - Carpet extraction detergent: [PRODUCT_NAME_4]
  - Heavy-duty degreaser: [PRODUCT_NAME_5]
  - Washroom descaler: [PRODUCT_NAME_6]
  - Multi-surface disinfectant: [PRODUCT_NAME_7]
  - Grout cleaner: [PRODUCT_NAME_8]

================================================================================
  SECTION 4 — PPE REQUIREMENTS
================================================================================

  All Tasks:
  - Non-slip safety footwear (EN ISO 20345)
  - Company uniform / hi-vis tabard
  - Chemical-resistant gloves (nitrile — EN 374)

  Floor Stripping/Sealing:
  - Safety goggles (EN 166) — chemical splash risk
  - Chemical-resistant apron
  - Knee pads (if kneeling work required)
  - RPE if working in confined or poorly ventilated areas (FFP2 minimum)

  High-Level Cleaning:
  - Hard hat if overhead risks identified
  - Safety goggles for overhead work (drips/debris)

  Pressure Washing:
  - Waterproof overalls
  - Safety goggles or face shield
  - Hearing protection (if >80dB — Control of Noise at Work Regs 2005)

================================================================================
  SECTION 5 — SEQUENCE OF OPERATIONS
================================================================================

  PHASE 1: SITE PREPARATION
  -----------------------------------------------------------------------
  - Conduct site visit / pre-start meeting with client
  - Confirm areas to be cleaned and any restrictions
  - Identify and isolate electrical equipment / IT cabling
  - Move or protect furniture and client property as agreed
  - Erect warning signs and barriers at work area perimeters
  - Ensure adequate ventilation — open windows where possible
  - Cover/protect items that cannot be moved (desks, monitors)
  - Identify power points and check RCD protection available
  - Set up equipment staging area

  Hazards: Manual handling (furniture), client property damage, trips
  Controls: Two-person lifts, furniture sliders, protective sheeting,
  advance notice to building occupants

  PHASE 2: HIGH-LEVEL CLEANING
  -----------------------------------------------------------------------
  - Begin at the highest point — ceilings, light fittings, air vents
  - Use telescopic poles where possible (preferred over ladders)
  - If stepladder required: inspect before use, 3-point contact rule,
    do not overreach, spotter present if on ladder
  - Vacuum air vents and light diffusers
  - Damp wipe ceiling tiles, pipework, cable trays
  - Spot clean walls — work top to bottom

  Hazards: Falls from height, falling objects, dust, overreaching
  Controls: Telescopic poles, EN 131 ladder, 3-point contact,
  dust sheets below, goggles for overhead work

  PHASE 3: WALL AND SURFACE CLEANING
  -----------------------------------------------------------------------
  - Wash walls with appropriate cleaning solution
  - Remove marks, scuffs, and stains
  - Clean light switches, power sockets (with damp cloth, not wet)
  - Clean door frames, door handles, skirting boards
  - Clean internal glazing and partitions
  - Wipe down all ledges, shelves, and fitted furniture

  Hazards: Chemical contact, electrical (near sockets), manual handling
  Controls: Chemicals on cloth not surface, avoid liquid near sockets,
  work at comfortable height

  PHASE 4: CARPET DEEP CLEANING
  -----------------------------------------------------------------------
  - Pre-vacuum entire carpet area thoroughly
  - Pre-treat heavily soiled areas and stains
  - Set up hot water extraction machine
  - Work in sections, maintaining escape route
  - Extract in overlapping straight lines
  - Allow adequate drying time (typically 2-6 hours)
  - Place wet floor signs and restrict access until dry
  - Use air movers/fans to accelerate drying if available

  Hazards: Slips (wet carpet), electrical (water near equipment),
  manual handling (equipment), trips (hoses)
  Controls: RCD protection, cable routing, wet floor signs,
  restricted access, non-slip footwear

  PHASE 5: HARD FLOOR DEEP CLEAN / STRIP AND RE-SEAL
  -----------------------------------------------------------------------
  Step A — Stripping:
  - Apply floor stripping solution at correct dilution
  - Allow dwell time as per product instructions
  - Agitate with rotary machine and stripping pad
  - Pick up slurry with wet vacuum — do not allow to dry on floor
  - Rinse floor thoroughly with clean water
  - Allow to dry completely

  Step B — Sealing (if required):
  - Apply first coat of floor sealer using clean flat mop
  - Allow to dry fully (per manufacturer's instructions)
  - Apply second coat (cross-hatched application)
  - Allow to dry fully
  - Apply floor polish/finish (2-3 coats, allowing drying between coats)
  - Do not allow foot traffic until fully cured

  Hazards: Slips (stripper is extremely slippery), chemical burns
  (strippers are alkaline), fumes, manual handling (floor machine)
  Controls: Wet floor signs and barriers, goggles and gloves mandatory,
  ventilation, non-slip footwear, RPE if ventilation is poor,
  section work with dry escape route

  PHASE 6: WASHROOM / KITCHEN DEEP CLEAN
  -----------------------------------------------------------------------
  - Descale all sanitary ware, taps, showerheads
  - Deep clean grout lines
  - Clean behind and underneath all fittings where accessible
  - Disinfect all surfaces
  - Deep clean extraction fans and ventilation grilles
  - Clean and disinfect waste pipes and drains
  - Polish all chrome fittings
  - Re-seal silicone joints if specified in scope

  Hazards: Chemical (descaler is acidic), biological (drains, waste),
  confined spaces, slips
  Controls: Acid-resistant gloves, goggles, ventilation, RED cloths,
  disinfection procedure, wet floor signs

  PHASE 7: REINSTATEMENT AND COMPLETION
  -----------------------------------------------------------------------
  - Return all furniture to original positions
  - Remove all protective sheeting
  - Remove barriers and signs (once floors are dry)
  - Final quality inspection — room by room
  - Photograph completed work for records
  - Sign off with client representative
  - Remove all equipment and waste from site
  - Secure chemical store and lock up

  Hazards: Manual handling, trips, incomplete work
  Controls: Two-person lifts, quality checklist, client walkthrough

================================================================================
  SECTION 6 — EMERGENCY PROCEDURES
================================================================================

  Fire:
  - Stop work immediately on hearing the fire alarm
  - Make safe any equipment (turn off floor machines, close chemical containers)
  - Leave by nearest safe exit
  - Assemble at: [FIRE_ASSEMBLY_POINT]

  Chemical Spillage:
  - Refer to COSHH assessment / SDS for the substance
  - Ventilate the area, evacuate if necessary
  - Use spillage kit to contain and absorb
  - Floor stripping chemicals: contain immediately — extreme slip hazard

  Accident / Injury:
  - First aid kit: [FIRST_AID_LOCATION]
  - First aider: [FIRST_AIDER] / [PHONE]
  - Emergency: 999
  - Report all incidents using company Accident & Incident Report Form

  Equipment Failure:
  - Stop use immediately, isolate from power
  - Label "DO NOT USE" and report to supervisor
  - Do not attempt repair unless competent to do so

================================================================================
  SECTION 7 — WASTE DISPOSAL
================================================================================

  - Dirty water from extraction: dispose to foul drain only (not surface drain)
  - Floor stripping slurry: collect via wet vacuum, dispose to foul drain
  - Chemical containers: rinse and dispose as per SDS / return to supplier
  - General waste: bag and remove to site waste collection point
  - Any hazardous waste: segregate and dispose via licensed contractor

  Environmental Protection: All waste disposal in compliance with
  Environmental Protection Act 1990 and Water Industry Act 1991.
  No chemicals to be discharged to surface water drains.

================================================================================
  SECTION 8 — SIGN-OFF
================================================================================

  Prepared By:
  Name:       [PREPARED_BY_NAME]
  Position:   [PREPARED_BY_POSITION]
  Signature:  [PREPARED_BY_SIGNATURE]
  Date:       [DATE_PREPARED]

  Approved By:
  Name:       [APPROVED_BY_NAME]
  Position:   [APPROVED_BY_POSITION]
  Signature:  [APPROVED_BY_SIGNATURE]
  Date:       [APPROVAL_DATE]

  Client Acknowledgement:
  Name:       [CLIENT_REP_NAME]
  Position:   [CLIENT_REP_POSITION]
  Signature:  [CLIENT_REP_SIGNATURE]
  Date:       [CLIENT_DATE]

  Staff Acknowledgement:

  | Name | Signature | Date |
  |------|-----------|------|
  | [NAME_1] | [SIG_1] | [DATE_1] |
  | [NAME_2] | [SIG_2] | [DATE_2] |
  | [NAME_3] | [SIG_3] | [DATE_3] |

================================================================================
  {COMPANY_FULL}
  Ref: Health and Safety at Work etc. Act 1974
  Management of Health and Safety at Work Regulations 1999
  COSHH Regulations 2002 | PUWER 1998
================================================================================
"""

# ===================================================================
# 5. METHOD STATEMENT — KITCHEN / WASHROOM
# ===================================================================
TEMPLATES["method_statement_kitchen_washroom"] = f"""
================================================================================
  METHOD STATEMENT — KITCHEN AND WASHROOM CLEANING
  Safe System of Work
  {COMPANY_FULL}
================================================================================

  Document Reference:  MS/KW/[REFERENCE_NUMBER]
  Date Prepared:       [DATE_PREPARED]
  Prepared By:         [PREPARED_BY]
  Approved By:         [APPROVED_BY]
  Review Date:         [REVIEW_DATE]
  Site/Location:       [SITE_NAME_AND_ADDRESS]
  Client:              [CLIENT_NAME]

================================================================================
  SECTION 1 — SCOPE OF WORK
================================================================================

  This method statement covers kitchen/tea point and washroom cleaning:

  Kitchen / Tea Point:
  - Cleaning and sanitising all worktops and splashbacks
  - Cleaning sink, taps, and drainer
  - Exterior cleaning of appliances (microwave, kettle, toaster, fridge)
  - Interior fridge clean (as per schedule)
  - Cleaning and sanitising dining/break area tables and chairs
  - Sweeping and mopping floor with food-safe sanitiser
  - Emptying bins and replacing liners
  - Replenishing washing-up liquid, hand soap, paper towels

  Washroom:
  - Cleaning and disinfecting all WC pans, seats, and cisterns
  - Cleaning and disinfecting urinals and urinal channels
  - Cleaning and sanitising wash basins and taps
  - Cleaning mirrors
  - Cleaning and disinfecting all touchpoints (door handles, flush handles,
    light switches, hand dryer buttons, lock mechanisms)
  - Mopping floors with disinfectant
  - Descaling taps, showerheads, and sanitary ware (periodic)
  - Replenishing soap, hand towels, toilet rolls, air freshener
  - Checking and reporting sanitary bin service requirements
  - Cleaning partitions, tiled walls (periodic)

================================================================================
  SECTION 2 — COLOUR-CODED SYSTEM (MANDATORY)
================================================================================

  The British Cleaning Council colour-coding system MUST be followed at all
  times to prevent cross-contamination:

  RED    — Washrooms, toilets, urinals, bathroom floors
  GREEN  — Kitchen, food preparation areas, tea points
  BLUE   — General areas (offices, corridors, reception)
  YELLOW — Clinical/isolation areas (where applicable)

  This applies to: cloths, mop heads, buckets, gloves, and spray bottles.
  Cross-use of colour-coded items is strictly prohibited.

================================================================================
  SECTION 3 — EQUIPMENT AND MATERIALS
================================================================================

  Kitchen:
  - GREEN microfibre cloths and GREEN mop head
  - GREEN bucket
  - Food-safe surface sanitiser (BS EN 1276 / EN 13697 compliant)
  - Washing-up liquid
  - Stainless steel cleaner (for appliance exteriors)
  - Broom and dustpan
  - Flat mop system
  - Wet floor warning signs
  - Waste bags

  Washroom:
  - RED microfibre cloths and RED mop head
  - RED bucket
  - Washroom disinfectant cleaner
  - Toilet cleaner (under-rim applicator)
  - Limescale remover/descaler (for periodic use)
  - Glass/mirror cleaner
  - Toilet brush (site-specific — replaced regularly)
  - Wet floor warning signs
  - Nitrile disposable gloves
  - Disposable aprons (for bodily fluid clean-up)
  - Bodily fluid spillage kit

================================================================================
  SECTION 4 — PPE REQUIREMENTS
================================================================================

  Kitchen Cleaning:
  - Chemical-resistant gloves (GREEN — nitrile)
  - Non-slip safety footwear
  - Company uniform / tabard

  Washroom Cleaning:
  - Nitrile disposable gloves (changed between each washroom)
  - Safety goggles when using descaler or above head height spraying
  - Non-slip safety footwear
  - Disposable apron (when cleaning up bodily fluids or heavy contamination)
  - Company uniform / tabard

================================================================================
  SECTION 5 — SEQUENCE OF OPERATIONS — KITCHEN
================================================================================

  Step 1: Place wet floor sign at kitchen entrance
  Step 2: Put on GREEN nitrile gloves
  Step 3: Clear worktops of any items left by occupants (place to one side)
  Step 4: Empty bins, replace liners, wipe bin exterior with sanitiser
  Step 5: Spray worktops with food-safe sanitiser, allow contact time per label
  Step 6: Wipe worktops with GREEN cloth, working back to front
  Step 7: Clean sink, taps, and drainer — remove limescale as required
  Step 8: Clean splashback and tiled areas
  Step 9: Wipe exterior of all appliances with appropriate cleaner
  Step 10: Wipe tables and chairs with sanitiser
  Step 11: Replenish consumables (washing-up liquid, hand soap, paper towels)
  Step 12: Sweep floor, removing any food debris
  Step 13: Mop floor with food-safe sanitiser solution (GREEN mop)
  Step 14: Ensure wet floor sign remains until floor is dry
  Step 15: Final visual check — return items to worktops

  FOOD SAFETY NOTE: All sanitisers used in kitchen areas must be food-safe
  and compliant with BS EN 1276 or BS EN 13697. Allow adequate contact time.

================================================================================
  SECTION 6 — SEQUENCE OF OPERATIONS — WASHROOM
================================================================================

  Step 1: Place wet floor sign at washroom entrance
  Step 2: Put on fresh nitrile disposable gloves
  Step 3: Check for and deal with any bodily fluid contamination FIRST
          (if found, use bodily fluid spillage kit — see emergency procedures)
  Step 4: Apply toilet cleaner under rim of all WC pans, leave to dwell
  Step 5: Apply disinfectant cleaner to urinals, leave to dwell
  Step 6: While chemicals dwell, clean mirrors with glass cleaner
  Step 7: Clean and disinfect wash basins, taps, and surrounding surfaces
  Step 8: Clean and disinfect all touchpoints:
          - Door handles (inside and outside)
          - Cubicle locks and handles
          - Flush handles/buttons
          - Light switches
          - Hand dryer buttons
          - Soap dispenser push plates
          - Paper towel dispenser handles
  Step 9: Return to WCs — scrub inside bowl with toilet brush, flush
  Step 10: Wipe exterior of WC pans, seats (top and underside), cisterns
  Step 11: Clean urinals — scrub, flush, wipe exterior
  Step 12: Wipe cubicle partitions, doors, and walls (spot clean or full wash)
  Step 13: Replenish: toilet rolls, hand soap, paper towels, air freshener
  Step 14: Empty waste bins and sanitary bins (if permitted — some are serviced
           by specialist contractor)
  Step 15: Sweep floor to remove debris
  Step 16: Mop entire floor with disinfectant solution (RED mop)
  Step 17: Remove gloves, dispose in waste bag
  Step 18: Wash hands thoroughly with soap and water
  Step 19: Ensure wet floor sign remains until floor is dry
  Step 20: Final visual and smell check from doorway

  INFECTION CONTROL: Work from clean areas to dirty areas. Clean wash basins
  before toilets. Change gloves between washrooms. Never use RED equipment in
  any other area.

================================================================================
  SECTION 7 — EMERGENCY PROCEDURES
================================================================================

  Bodily Fluid Clean-Up (Blood, Vomit, Urine, Faeces):
  1. Put on disposable gloves and apron from spillage kit
  2. Cover the spill with absorbent granules from the kit
  3. Allow granules to absorb the fluid (follow kit instructions)
  4. Scoop up with disposable scoop and place in yellow clinical waste bag
  5. Clean the area with disinfectant at correct dilution
  6. Place all disposable items (gloves, apron, cloths) in yellow bag
  7. Seal yellow bag and place in clinical waste bin for collection
  8. Wash hands thoroughly with soap and water
  9. Report the incident and complete clean-up record

  Needlestick / Sharps Injury:
  1. Encourage wound to bleed — do NOT suck the wound
  2. Wash under running water with soap
  3. Cover with waterproof dressing
  4. Report to supervisor immediately
  5. Attend A&E — take details of the incident
  6. Complete Accident & Incident Report Form

  Chemical Splash:
  - Eyes: Irrigate with clean water for minimum 15 minutes, seek medical help
  - Skin: Remove contaminated clothing, wash with soap and water for 15 min
  - Inhalation: Move to fresh air, seek medical help if symptoms persist
  - Refer to specific COSHH assessment / SDS

================================================================================
  SECTION 8 — SIGN-OFF
================================================================================

  Prepared By:
  Name:       [PREPARED_BY_NAME]
  Position:   [PREPARED_BY_POSITION]
  Signature:  [PREPARED_BY_SIGNATURE]
  Date:       [DATE_PREPARED]

  Approved By:
  Name:       [APPROVED_BY_NAME]
  Position:   [APPROVED_BY_POSITION]
  Signature:  [APPROVED_BY_SIGNATURE]
  Date:       [APPROVAL_DATE]

  Staff Acknowledgement:

  | Name | Signature | Date |
  |------|-----------|------|
  | [NAME_1] | [SIG_1] | [DATE_1] |
  | [NAME_2] | [SIG_2] | [DATE_2] |
  | [NAME_3] | [SIG_3] | [DATE_3] |

================================================================================
  {COMPANY_FULL}
  Ref: Health and Safety at Work etc. Act 1974
  Food Safety Act 1990 | Food Hygiene Regulations 2006
  COSHH Regulations 2002
================================================================================
"""

# ===================================================================
# 6. SLIPS, TRIPS & FALLS RISK ASSESSMENT
# ===================================================================
TEMPLATES["slips_trips_falls_risk_assessment"] = f"""
================================================================================
  SLIPS, TRIPS AND FALLS RISK ASSESSMENT
  Specific to Floor Cleaning Operations
  {COMPANY_FULL}
================================================================================

  Document Reference:  RA/STF/[REFERENCE_NUMBER]
  Assessment Date:     [ASSESSMENT_DATE]
  Review Date:         [REVIEW_DATE]
  Assessor Name:       [ASSESSOR_NAME]
  Location/Site:       [SITE_NAME_AND_ADDRESS]

  Legal Basis: Workplace (Health, Safety and Welfare) Regulations 1992,
               Regulation 12 — Condition of floors and traffic routes
               Health and Safety at Work etc. Act 1974, Section 2
               HSE Guidance: INDG225 — Preventing slips and trips at work

  Note: Slips, trips and falls are the single most common cause of major
  injury in UK workplaces, accounting for over 30% of all reported injuries.

================================================================================
  SECTION 1 — FLOOR TYPES AND CONDITIONS
================================================================================

  Floor types present at this site:

  | Area | Floor Type | Condition | Slip Resistance Rating |
  |------|-----------|-----------|----------------------|
  | [AREA_1] | [TYPE_1] (e.g., vinyl, ceramic tile, carpet) | [CONDITION_1] | [RATING_1] |
  | [AREA_2] | [TYPE_2] | [CONDITION_2] | [RATING_2] |
  | [AREA_3] | [TYPE_3] | [CONDITION_3] | [RATING_3] |
  | [AREA_4] | [TYPE_4] | [CONDITION_4] | [RATING_4] |

  Known problem areas: [PROBLEM_AREAS]
  (e.g., entrance lobby when wet, ramp to car park, kitchen near sink)

================================================================================
  SECTION 2 — HAZARD IDENTIFICATION
================================================================================

  2.1 SLIP HAZARDS (loss of traction between foot and floor):

  [ ] Wet floors from mopping — HIGHEST RISK
  [ ] Water tracked in from outside (entrance areas, rain)
  [ ] Spillages (drinks, food, chemicals)
  [ ] Over-application of floor polish or cleaning solution
  [ ] Condensation on floor surfaces
  [ ] Floor cleaning chemicals reducing traction
  [ ] Loose mats or rugs not secured
  [ ] Polished/smooth floor surfaces with low slip resistance
  [ ] Greasy/oily residue (kitchen areas)
  [ ] Leaves and debris tracked in from outside
  [ ] Contamination from work processes (e.g., washroom water)
  [ ] Inappropriate footwear

  2.2 TRIP HAZARDS (foot striking or catching an object):

  [ ] Trailing cables from vacuum cleaners and floor machines
  [ ] Extension leads across walkways
  [ ] Cleaning equipment left unattended in walkways
  [ ] Waste bags placed in circulation areas
  [ ] Raised edges of floor mats or carpet tiles
  [ ] Changes in floor level (thresholds, ramps, steps)
  [ ] Damaged or uneven flooring
  [ ] Cable ducts and trunking
  [ ] Door thresholds
  [ ] Hoses from extraction machines

  2.3 FALL HAZARDS (falling from one level to another):

  [ ] Stairs — cleaning on stairways
  [ ] Steps — internal/external
  [ ] Ramps — especially when wet
  [ ] Standing on chairs/desks to reach high areas (PROHIBITED)
  [ ] Ladder use (refer to Work at Height Risk Assessment)

================================================================================
  SECTION 3 — PERSONS AT RISK
================================================================================

  [ ] Cleaning operatives (directly exposed — handling wet floors/equipment)
  [ ] Client staff (may enter recently cleaned areas)
  [ ] Visitors to the building
  [ ] Members of the public (if publicly accessible building)
  [ ] Disabled persons (wheelchair users, visually impaired, mobility impaired)
  [ ] Elderly persons
  [ ] Delivery drivers and contractors

================================================================================
  SECTION 4 — EXISTING CONTROL MEASURES
================================================================================

  4.1 Wet Floor Management:
  - Wet floor warning signs placed BEFORE mopping commences
  - Minimum 2 signs per area — at all access points
  - Signs remain in place until floor is completely dry (minimum 30 minutes)
  - Floor cleaned in sections — dry walkway maintained at all times
  - "Half-corridor" technique used in corridors (clean one side, allow to dry)
  - Mopping carried out during low-traffic hours where possible
  - Correct dilution of cleaning chemicals (over-concentration increases slip)
  - Flat mop system used (wrings out more water than string mop)
  - Air movers/fans used to accelerate drying in high-traffic areas

  4.2 Cable and Equipment Management:
  - Vacuum cleaner cables routed along walls, over shoulder, not across walkways
  - Equipment not left unattended in walkways
  - Hoses and cables taped down or covered with cable protectors when crossing
    walkways is unavoidable
  - Equipment stored in designated area when not in use
  - Cleaning trolley positioned out of walkways

  4.3 Footwear:
  - All cleaning operatives issued non-slip safety footwear (EN ISO 20345)
  - Footwear replaced when soles become worn
  - Operatives instructed to walk, not run

  4.4 Housekeeping:
  - Waste bags placed in cleaning trolley, not on floor
  - Spillages cleaned up immediately — spot cleaning procedure
  - Entrance matting checked and maintained
  - Damaged floor surfaces reported to client for repair
  - Adequate lighting verified before work commences
  - Obstructions removed before cleaning begins

  4.5 Training:
  - Slip, trip, and fall awareness included in induction
  - Refresher training provided annually
  - Toolbox talks on slip prevention conducted quarterly

================================================================================
  SECTION 5 — RISK ASSESSMENT TABLE
================================================================================

  | Hazard | Who | L | S | Score | Controls | Residual L | Residual S | Residual Score |
  |--------|-----|---|---|-------|----------|-----------|-----------|---------------|
  | Wet floor from mopping | All | [L] | [S] | [SC] | Wet floor signs, section mopping, dry walkway, timing, non-slip shoes | [RL] | [RS] | [RR] |
  | Trailing vacuum cables | All | [L] | [S] | [SC] | Cable over shoulder, route along walls, awareness | [RL] | [RS] | [RR] |
  | Spillages/contamination | All | [L] | [S] | [SC] | Immediate clean-up, spillage procedure, reporting | [RL] | [RS] | [RR] |
  | Floor machine hoses | All | [L] | [S] | [SC] | Barriers, cable covers, timing, supervision | [RL] | [RS] | [RR] |
  | Equipment in walkways | All | [L] | [S] | [SC] | Equipment stored correctly, trolley off walkway | [RL] | [RS] | [RR] |
  | Entrance area (rain) | All | [L] | [S] | [SC] | Matting, extra mopping in wet weather, signs | [RL] | [RS] | [RR] |
  | Stairs cleaning | Staff | [L] | [S] | [SC] | Top-to-bottom, handrail use, section cleaning | [RL] | [RS] | [RR] |
  | Damaged flooring | All | [L] | [S] | [SC] | Report to client, temporary warning sign/barrier | [RL] | [RS] | [RR] |
  | Poor lighting | All | [L] | [S] | [SC] | Check lighting, report failures, use torch if needed | [RL] | [RS] | [RR] |

================================================================================
  SECTION 6 — ADDITIONAL CONTROLS AND ACTION PLAN
================================================================================

  | Action Required | Priority | Responsible | Target Date | Completed |
  |----------------|----------|-------------|-------------|-----------|
  | [ACTION_1] | [PRIORITY] | [PERSON] | [DATE] | [ ] |
  | [ACTION_2] | [PRIORITY] | [PERSON] | [DATE] | [ ] |
  | [ACTION_3] | [PRIORITY] | [PERSON] | [DATE] | [ ] |

================================================================================
  SECTION 7 — SIGN-OFF
================================================================================

  Assessed By:
  Name:       [ASSESSOR_NAME]
  Position:   [ASSESSOR_POSITION]
  Signature:  [ASSESSOR_SIGNATURE]
  Date:       [ASSESSMENT_DATE]

  Approved By:
  Name:       [APPROVER_NAME]
  Position:   [APPROVER_POSITION]
  Signature:  [APPROVER_SIGNATURE]
  Date:       [APPROVAL_DATE]

  Next Review Date: [REVIEW_DATE]

================================================================================
  {COMPANY_FULL}
  Ref: Workplace (Health, Safety and Welfare) Regulations 1992, Reg. 12
  HSE INDG225 — Preventing slips and trips at work
  HSE Slips Assessment Tool (SAT)
================================================================================
"""

# ===================================================================
# 7. WORK AT HEIGHT RISK ASSESSMENT
# ===================================================================
TEMPLATES["work_at_height_risk_assessment"] = f"""
================================================================================
  WORK AT HEIGHT RISK ASSESSMENT
  Window Cleaning and High-Level Dusting
  {COMPANY_FULL}
================================================================================

  Document Reference:  RA/WAH/[REFERENCE_NUMBER]
  Assessment Date:     [ASSESSMENT_DATE]
  Review Date:         [REVIEW_DATE]
  Assessor Name:       [ASSESSOR_NAME]
  Location/Site:       [SITE_NAME_AND_ADDRESS]

  Legal Basis: Work at Height Regulations 2005
               Health and Safety at Work etc. Act 1974
               Provision and Use of Work Equipment Regulations 1998 (PUWER)

  Definition: Work at height means work in any place where, if precautions
  were not taken, a person could fall a distance liable to cause personal
  injury (Work at Height Regulations 2005, Regulation 2).

================================================================================
  SECTION 1 — TASK DESCRIPTION
================================================================================

  Tasks involving work at height at this site:

  [ ] Internal window cleaning above ground level
  [ ] External window cleaning (ground floor — from ground level)
  [ ] External window cleaning (upper floors)
  [ ] High-level dusting (ceiling vents, light fittings, high shelves)
  [ ] Cleaning above suspended ceilings
  [ ] Cleaning stairwells
  [ ] Cleaning atriums or high-ceiling areas
  [ ] Cleaning external signage
  [ ] Gutter clearing
  [ ] Pressure washing at height (external walls)

  Maximum working height: [MAXIMUM_HEIGHT] metres
  Description of work: [DETAILED_DESCRIPTION]

================================================================================
  SECTION 2 — HIERARCHY OF CONTROL (Regulation 6)
================================================================================

  The Work at Height Regulations 2005 require that the following hierarchy
  is applied (in order of preference):

  STEP 1 — AVOID work at height where possible
  [ ] Can the task be done from ground level?
  [ ] Can telescopic/extension pole systems be used?
  [ ] Can the task be eliminated (e.g., self-cleaning glass)?
  Details: [AVOIDANCE_DETAILS]

  STEP 2 — PREVENT falls using existing safe places of work or equipment
  [ ] Existing guardrails, barriers, or edge protection available?
  [ ] Mobile Elevating Work Platform (MEWP) — cherry picker?
  [ ] Tower scaffold?
  [ ] Podium steps with guardrails?
  Details: [PREVENTION_DETAILS]

  STEP 3 — MINIMISE the distance and consequences of a fall
  [ ] Safety nets?
  [ ] Personal fall arrest system (harness and lanyard)?
  [ ] Air bags / soft landing systems?
  [ ] Stepladder (only where other options not reasonably practicable)?
  Details: [MINIMISATION_DETAILS]

  Equipment selected for this task: [SELECTED_EQUIPMENT]
  Justification: [JUSTIFICATION_FOR_SELECTION]

================================================================================
  SECTION 3 — EQUIPMENT REQUIREMENTS
================================================================================

  3.1 Telescopic Pole System (preferred for internal high-level work):
  [ ] Telescopic pole with appropriate head attachments
  [ ] Maximum reach: [MAX_REACH] metres
  [ ] Stable footing required — non-slip floor
  [ ] No work at height — operative remains at ground level

  3.2 Stepladder (EN 131 compliant):
  [ ] Maximum height of stepladder: [LADDER_HEIGHT]
  [ ] Platform stepladder preferred (provides handhold)
  [ ] Condition: inspected before each use
  [ ] Inspection label/tag current: [ ] Yes  [ ] No
  [ ] Three points of contact maintained at all times
  [ ] Not used on uneven or slippery surfaces
  [ ] Not used in high-wind conditions (external)
  [ ] Spotter present when in use
  [ ] Duration of work on ladder limited to 30 minutes maximum

  3.3 Podium Steps (preferred over stepladders where available):
  [ ] Guardrails on all sides
  [ ] Platform size adequate for task
  [ ] Locking castors engaged before use
  [ ] Condition checked before use

  3.4 Mobile Tower Scaffold:
  [ ] Erected by competent person (PASMA trained)
  [ ] Correct configuration for height required
  [ ] Outriggers and stabilisers deployed
  [ ] Base locked and on firm, level ground
  [ ] Toeboards and guardrails fitted
  [ ] Access via internal ladder
  [ ] Weekly inspection record maintained
  [ ] Not moved with persons on platform

  3.5 Personal Fall Protection:
  [ ] Full body harness (EN 361)
  [ ] Lanyard with energy absorber (EN 355)
  [ ] Anchor point rated to [ANCHOR_RATING] kN
  [ ] Equipment inspected by competent person (6-monthly)
  [ ] User trained in fitting and use

================================================================================
  SECTION 4 — HAZARD IDENTIFICATION AND CONTROLS
================================================================================

  | Hazard | Who at Risk | L | S | Score | Control Measures | Residual |
  |--------|------------|---|---|-------|-----------------|----------|
  | Fall from stepladder | Operative | [L] | [S] | [SC] | EN 131 ladder, 3-point contact, spotter, inspection, no overreaching | [RR] |
  | Falling objects (tools, equipment) | Operative, persons below | [L] | [S] | [SC] | Tool lanyard, exclusion zone below, warning signs | [RR] |
  | Ladder slip on smooth floor | Operative | [L] | [S] | [SC] | Ladder feet in good condition, non-slip floor, mat under ladder | [RR] |
  | Overreaching | Operative | [L] | [S] | [SC] | Move ladder rather than overreach, belt buckle rule | [RR] |
  | Adverse weather (external) | Operative | [L] | [S] | [SC] | Do not work at height in high winds (>gusts 25mph), rain, ice, frost | [RR] |
  | Fragile surfaces (skylights, roof lights) | Operative | [L] | [S] | [SC] | No walking on fragile surfaces, barriers, warning signs | [RR] |
  | Untrained personnel | Operative | [L] | [S] | [SC] | Only trained/competent persons work at height | [RR] |
  | Pre-existing medical conditions | Operative | [L] | [S] | [SC] | Health questionnaire, vertigo/medication check, fitness assessment | [RR] |

================================================================================
  SECTION 5 — COMPETENCE REQUIREMENTS
================================================================================

  All persons carrying out work at height must:
  [ ] Be competent and trained for the specific equipment being used
  [ ] Have received work at height awareness training
  [ ] Have completed ladder safety training (if using ladders)
  [ ] Hold PASMA certificate (if erecting/using mobile towers)
  [ ] Hold IPAF licence (if operating MEWPs)
  [ ] Be physically fit — no conditions affecting balance or consciousness
  [ ] Not be under the influence of alcohol or medication affecting balance

  Training records held for:

  | Name | Training | Certificate No. | Expiry Date |
  |------|----------|-----------------|-------------|
  | [NAME_1] | [TRAINING_1] | [CERT_1] | [EXPIRY_1] |
  | [NAME_2] | [TRAINING_2] | [CERT_2] | [EXPIRY_2] |

================================================================================
  SECTION 6 — EMERGENCY AND RESCUE PLAN
================================================================================

  In the event of a fall or person stranded at height:

  1. Call emergency services: 999
  2. Do not move the casualty unless in immediate danger
  3. Administer first aid if trained and safe to do so
  4. If person is suspended in harness, rescue must occur within
     15 minutes (suspension trauma risk)
  5. First aid kit location: [FIRST_AID_LOCATION]
  6. Nearest A&E: [NEAREST_AE]

  Rescue equipment available:
  [ ] Rescue plan documented
  [ ] Rescue kit on site
  [ ] Personnel trained in rescue procedures
  [ ] Emergency contact numbers displayed

================================================================================
  SECTION 7 — PRE-USE CHECKS
================================================================================

  Before each use, the following must be checked:

  Ladders:
  [ ] Stiles not bent, cracked, or damaged
  [ ] Rungs/steps secure and not damaged
  [ ] Feet/shoes in good condition (anti-slip)
  [ ] Locking mechanisms (stepladder stays) functioning
  [ ] No contamination (oil, grease, mud)
  [ ] Inspection label current

  Tower Scaffolds:
  [ ] All components present and undamaged
  [ ] Base plates and castors in good condition
  [ ] Guardrails and toeboards fitted
  [ ] Bracing and frames secure
  [ ] Platform boards in good condition

  Harness Systems:
  [ ] Webbing not frayed, cut, or damaged
  [ ] Stitching intact
  [ ] Buckles and connectors functioning
  [ ] Lanyard not damaged, energy absorber not deployed
  [ ] Within inspection date

================================================================================
  SECTION 8 — SIGN-OFF
================================================================================

  Assessed By:
  Name:       [ASSESSOR_NAME]
  Position:   [ASSESSOR_POSITION]
  Signature:  [ASSESSOR_SIGNATURE]
  Date:       [ASSESSMENT_DATE]

  Approved By:
  Name:       [APPROVER_NAME]
  Position:   [APPROVER_POSITION]
  Signature:  [APPROVER_SIGNATURE]
  Date:       [APPROVAL_DATE]

  Next Review Date: [REVIEW_DATE]

================================================================================
  {COMPANY_FULL}
  Ref: Work at Height Regulations 2005
  PUWER 1998 | LOLER 1998 (for lifting equipment)
  HSE INDG401 — Working at height: A brief guide
================================================================================
"""

# ===================================================================
# 8. LONE WORKING RISK ASSESSMENT
# ===================================================================
TEMPLATES["lone_working_risk_assessment"] = f"""
================================================================================
  LONE WORKING RISK ASSESSMENT
  {COMPANY_FULL}
================================================================================

  Document Reference:  RA/LW/[REFERENCE_NUMBER]
  Assessment Date:     [ASSESSMENT_DATE]
  Review Date:         [REVIEW_DATE]
  Assessor Name:       [ASSESSOR_NAME]
  Location/Site:       [SITE_NAME_AND_ADDRESS]

  Legal Basis: Health and Safety at Work etc. Act 1974, Section 2
               Management of Health and Safety at Work Regulations 1999
               Corporate Manslaughter and Corporate Homicide Act 2007
               HSE Guidance: INDG73 — Working alone

  Definition: A lone worker is someone who works by themselves without close
  or direct supervision, including those who work in isolation from colleagues.

================================================================================
  SECTION 1 — LONE WORKING SITUATIONS
================================================================================

  Tick all situations where lone working may occur:

  [ ] Evening/night cleaning after building occupants have left
  [ ] Early morning cleaning before building occupants arrive
  [ ] Weekend cleaning when building is unoccupied
  [ ] Cleaning in remote or isolated parts of a building
  [ ] Travelling between sites
  [ ] Cleaning in residential properties (domestic cleaning)
  [ ] Emergency call-out work
  [ ] Bank holiday cleaning
  [ ] Any shift where only one operative is assigned

  Sites where lone working occurs:

  | Site | Address | Lone Working Hours | Frequency |
  |------|---------|-------------------|-----------|
  | [SITE_1] | [ADDRESS_1] | [HOURS_1] | [FREQ_1] |
  | [SITE_2] | [ADDRESS_2] | [HOURS_2] | [FREQ_2] |
  | [SITE_3] | [ADDRESS_3] | [HOURS_3] | [FREQ_3] |

================================================================================
  SECTION 2 — HAZARD IDENTIFICATION
================================================================================

  2.1 Physical Hazards (inability to get help):
  [ ] Accident or injury with no one to raise alarm or provide first aid
  [ ] Sudden illness (heart attack, epileptic seizure, diabetic episode)
  [ ] Slip, trip, or fall in isolated area
  [ ] Trapped or locked in
  [ ] Electrical shock
  [ ] Exposure to hazardous substances (fumes in unventilated area)

  2.2 Security / Violence Hazards:
  [ ] Verbal abuse or intimidation by building occupants or intruders
  [ ] Physical assault
  [ ] Intruders or trespassers in building during unsocial hours
  [ ] Theft of personal belongings or company equipment
  [ ] Sexual harassment or assault
  [ ] Working in areas with known security concerns

  2.3 Psychological Hazards:
  [ ] Stress and anxiety from working alone
  [ ] Fear for personal safety (especially during dark hours)
  [ ] Feeling isolated with no colleague support

  2.4 Environmental Hazards:
  [ ] Working in unfamiliar buildings or areas
  [ ] Poor lighting
  [ ] Lack of heating or ventilation
  [ ] Presence of other workers/occupants unknown to cleaning operative

================================================================================
  SECTION 3 — PERSONS AT RISK
================================================================================

  [ ] All lone workers employed or engaged by the company
  [ ] Young workers (under 18) — MUST NOT work alone
  [ ] New starters (first 4 weeks) — MUST NOT work alone
  [ ] Pregnant workers or new mothers — additional assessment required
  [ ] Workers with medical conditions (epilepsy, diabetes, heart condition)
  [ ] Workers who do not speak English fluently (communication difficulties)

================================================================================
  SECTION 4 — EXISTING CONTROL MEASURES
================================================================================

  4.1 Suitability Assessment:
  - Lone worker suitability assessment completed for each worker
  - Medical conditions that may affect lone working identified
  - Workers under 18 and new starters (first 4 weeks) prohibited from
    lone working
  - Pregnant workers assessed individually

  4.2 Communication System — CHECK-IN/CHECK-OUT PROCEDURE:

  Before shift:
  - Lone worker sends CHECK-IN message to supervisor via [COMMUNICATION_METHOD]
    (text/WhatsApp/app) confirming: site name, expected start and finish time
  - Supervisor acknowledges receipt

  During shift:
  - If shift exceeds 2 hours, lone worker sends welfare check at midpoint
  - Supervisor acknowledges receipt

  End of shift:
  - Lone worker sends CHECK-OUT message confirming safe departure
  - If CHECK-OUT not received within 30 minutes of expected finish time,
    supervisor initiates escalation procedure (see Section 5)

  4.3 Lone Worker Device / App:
  [ ] Lone worker alarm device issued (make/model: [DEVICE_MODEL])
  [ ] SOS/panic button feature
  [ ] GPS tracking enabled
  [ ] Man-down detection (tilt/no-movement alarm)
  [ ] Monitored by: [MONITORING_PROVIDER]
  OR
  [ ] Mobile phone with lone worker app: [APP_NAME]
  [ ] Charged mobile phone carried at all times

  4.4 Site Security:
  - Building access procedure: [ACCESS_PROCEDURE]
  - Alarm codes and procedures provided
  - Emergency exits identified and unobstructed
  - Adequate lighting in all work areas
  - CCTV operational (where present)
  - Lone worker advised to lock entry doors from inside where possible

  4.5 Training:
  - All lone workers trained in lone working procedure
  - Conflict avoidance and personal safety awareness
  - First aid at work (appointed person as minimum)
  - Emergency procedure for the specific site
  - Use of lone worker device / app

  4.6 Task Restrictions:
  The following tasks are PROHIBITED for lone workers:
  - Work at height using ladders or scaffolding
  - Use of hazardous chemicals requiring RPE
  - Tasks involving confined space entry
  - Manual handling of loads over 15kg
  - Work involving significant electrical risk
  - Floor stripping with solvent-based chemicals

================================================================================
  SECTION 5 — ESCALATION PROCEDURE (OVERDUE CHECK-OUT)
================================================================================

  If the lone worker fails to check out at the expected time:

  TIME + 0 min:   Supervisor calls lone worker mobile (attempt 1)
  TIME + 5 min:   Supervisor calls again (attempt 2) + sends text message
  TIME + 10 min:  Supervisor calls emergency contact for the worker
  TIME + 15 min:  Supervisor calls site security / keyholder
  TIME + 20 min:  If no response from any contact, supervisor attends site
                  OR calls 999 and requests welfare check
  TIME + 30 min:  Police welfare check if site cannot be accessed

  Escalation contacts:

  | Role | Name | Phone |
  |------|------|-------|
  | Supervisor on duty | [SUPERVISOR_NAME] | [SUPERVISOR_PHONE] |
  | Operations Manager | [OPS_MANAGER_NAME] | [OPS_MANAGER_PHONE] |
  | Director | [DIRECTOR_NAME] | [DIRECTOR_PHONE] |
  | Site keyholder | [KEYHOLDER_NAME] | [KEYHOLDER_PHONE] |
  | Emergency services | N/A | 999 |

================================================================================
  SECTION 6 — RISK ASSESSMENT TABLE
================================================================================

  | Hazard | Who | L | S | Score | Controls | Residual Score |
  |--------|-----|---|---|-------|----------|---------------|
  | Injury with no assistance | Lone worker | [L] | [S] | [SC] | Check-in/out system, lone worker device, first aid training | [RR] |
  | Medical emergency | Lone worker | [L] | [S] | [SC] | Medical screening, device with man-down, escalation procedure | [RR] |
  | Violence / aggression | Lone worker | [L] | [S] | [SC] | Site assessment, conflict training, panic alarm, locked doors | [RR] |
  | Intruders | Lone worker | [L] | [S] | [SC] | Locked doors, CCTV, alarm, personal safety training | [RR] |
  | Trapped / locked in | Lone worker | [L] | [S] | [SC] | Key/access provision, mobile phone, check-out system | [RR] |
  | Psychological stress | Lone worker | [L] | [S] | [SC] | Welfare checks, supervision, right to refuse, support | [RR] |
  | Working in dark hours | Lone worker | [L] | [S] | [SC] | Adequate lighting, torch, hi-vis, secure parking | [RR] |

================================================================================
  SECTION 7 — SIGN-OFF
================================================================================

  Assessed By:
  Name:       [ASSESSOR_NAME]
  Position:   [ASSESSOR_POSITION]
  Signature:  [ASSESSOR_SIGNATURE]
  Date:       [ASSESSMENT_DATE]

  Approved By:
  Name:       [APPROVER_NAME]
  Position:   [APPROVER_POSITION]
  Signature:  [APPROVER_SIGNATURE]
  Date:       [APPROVAL_DATE]

  Lone Worker Acknowledgement:
  I confirm I have read and understood the lone working policy and procedure.

  | Name | Signature | Date |
  |------|-----------|------|
  | [NAME_1] | [SIG_1] | [DATE_1] |
  | [NAME_2] | [SIG_2] | [DATE_2] |
  | [NAME_3] | [SIG_3] | [DATE_3] |

  Next Review Date: [REVIEW_DATE]

================================================================================
  {COMPANY_FULL}
  Ref: Health and Safety at Work etc. Act 1974, Section 2
  Management of Health and Safety at Work Regulations 1999
  HSE INDG73 — Working alone: Health and safety guidance
================================================================================
"""

# ===================================================================
# 9. CHEMICAL SAFETY DATA SHEET (SUMMARY CARD)
# ===================================================================
TEMPLATES["chemical_safety_data_sheet"] = f"""
================================================================================
  CHEMICAL SAFETY DATA SHEET — SUMMARY CARD
  {COMPANY_FULL}
================================================================================

  Document Reference:  SDS/[REFERENCE_NUMBER]
  Date Prepared:       [DATE_PREPARED]
  Prepared By:         [PREPARED_BY]

  NOTE: This is a simplified point-of-use summary card. It does NOT replace
  the manufacturer's full Safety Data Sheet (SDS), which must be retained on
  file and available for reference. Full SDS compliant with REACH Regulation
  (EC) No 1907/2006, Annex II (as adopted into UK law under UK REACH).

================================================================================
  PRODUCT IDENTIFICATION
================================================================================

  Product Name:          [PRODUCT_NAME]
  Manufacturer:          [MANUFACTURER]
  Supplier:              [SUPPLIER_NAME]
  Product Code:          [PRODUCT_CODE]
  UN Number (if any):    [UN_NUMBER]
  SDS Version/Date:      [SDS_VERSION] / [SDS_DATE]
  Intended Use:          [INTENDED_USE]
  Dilution Ratio:        [DILUTION_RATIO]
  pH (concentrate):      [PH_CONCENTRATE]
  pH (use dilution):     [PH_USE_DILUTION]
  Appearance:            [APPEARANCE]
  Odour:                 [ODOUR]

================================================================================
  HAZARD IDENTIFICATION
================================================================================

  GHS Pictograms:       [PICTOGRAM_CODES]
  Signal Word:           [SIGNAL_WORD]

  Hazard Statements:
  [H_CODE_1]: [H_STATEMENT_1]
  [H_CODE_2]: [H_STATEMENT_2]
  [H_CODE_3]: [H_STATEMENT_3]

  Precautionary Statements:
  [P_CODE_1]: [P_STATEMENT_1]
  [P_CODE_2]: [P_STATEMENT_2]
  [P_CODE_3]: [P_STATEMENT_3]

  Contains: [HAZARDOUS_INGREDIENTS]

================================================================================
  PERSONAL PROTECTIVE EQUIPMENT
================================================================================

  +--------------------+-------------------------------+
  | PPE Type           | Requirement                   |
  +--------------------+-------------------------------+
  | Gloves             | [GLOVE_REQUIREMENT]           |
  | Eye Protection     | [EYE_REQUIREMENT]             |
  | Respiratory        | [RESPIRATORY_REQUIREMENT]     |
  | Skin Protection    | [SKIN_REQUIREMENT]            |
  +--------------------+-------------------------------+

================================================================================
  FIRST AID MEASURES
================================================================================

  EYES:       [FIRST_AID_EYES]
  SKIN:       [FIRST_AID_SKIN]
  INHALATION: [FIRST_AID_INHALATION]
  INGESTION:  [FIRST_AID_INGESTION]

  National Poisons Information Service: 0344 892 0111
  Emergency Services: 999

================================================================================
  SPILLAGE MEASURES
================================================================================

  Small Spill: [SMALL_SPILL_PROCEDURE]
  Large Spill: [LARGE_SPILL_PROCEDURE]
  Environmental: [ENVIRONMENTAL_PRECAUTIONS]

================================================================================
  STORAGE
================================================================================

  Temperature:          [STORAGE_TEMPERATURE]
  Incompatible With:    [INCOMPATIBLE_SUBSTANCES]
  Special Conditions:   [STORAGE_CONDITIONS]
  Shelf Life:           [SHELF_LIFE]

================================================================================
  DISPOSAL
================================================================================

  Disposal Method:      [DISPOSAL_METHOD]
  EWC Code:             [EWC_CODE]

================================================================================
  DO NOT MIX WITH:
  [INCOMPATIBLE_CHEMICALS]
  (MIXING CHEMICALS CAN PRODUCE TOXIC GASES OR VIOLENT REACTIONS)
================================================================================

  Full SDS Location: [SDS_FILE_LOCATION]
  COSHH Assessment Ref: [COSHH_REF]

================================================================================
  {COMPANY_FULL}
  Ref: REACH Regulation (UK REACH) | CLP Regulation (EC) 1272/2008
  COSHH Regulations 2002
================================================================================
"""

# ===================================================================
# 10. ACCIDENT & INCIDENT REPORT FORM (RIDDOR-COMPLIANT)
# ===================================================================
TEMPLATES["accident_incident_report"] = f"""
================================================================================
  ACCIDENT AND INCIDENT REPORT FORM
  {COMPANY_FULL}
================================================================================

  Document Reference:  AIR/[REFERENCE_NUMBER]
  Form Completed By:   [FORM_COMPLETED_BY]
  Date of Report:      [REPORT_DATE]

  Legal Basis: Reporting of Injuries, Diseases and Dangerous Occurrences
               Regulations 2013 (RIDDOR)
               Social Security (Claims and Payments) Regulations 1979
               (Accident Book — BI 510)
               Health and Safety at Work etc. Act 1974

  IMPORTANT: This form must be completed as soon as practicable after
  any accident, incident, near miss, or case of work-related ill health.
  RIDDOR-reportable events must be reported to the HSE within the statutory
  time limits (see Section 8).

================================================================================
  SECTION 1 — TYPE OF EVENT (tick one)
================================================================================

  [ ] Accident resulting in injury
  [ ] Dangerous occurrence (no injury but potential for serious harm)
  [ ] Near miss (no injury, no damage, but had potential)
  [ ] Work-related ill health / occupational disease
  [ ] Damage to property or equipment only
  [ ] Violence or aggression incident
  [ ] Environmental incident (spillage, release)

================================================================================
  SECTION 2 — DETAILS OF THE INJURED/AFFECTED PERSON
================================================================================

  Full Name:                    [INJURED_PERSON_NAME]
  Date of Birth:                [DATE_OF_BIRTH]
  Home Address:                 [HOME_ADDRESS]
  Contact Number:               [CONTACT_NUMBER]
  Job Title/Role:               [JOB_TITLE]
  Employment Status:            [ ] Employee  [ ] Subcontractor  [ ] Agency
                                [ ] Client staff  [ ] Visitor  [ ] Public
  National Insurance Number:    [NI_NUMBER]
  Length of Service:             [LENGTH_OF_SERVICE]
  Normal Place of Work:          [NORMAL_WORKPLACE]

================================================================================
  SECTION 3 — INCIDENT DETAILS
================================================================================

  Date of Incident:             [INCIDENT_DATE]
  Time of Incident:             [INCIDENT_TIME]
  Location (site name):         [SITE_NAME]
  Location (specific area):     [SPECIFIC_LOCATION]
  Client Name:                  [CLIENT_NAME]

  Was the person working alone?  [ ] Yes  [ ] No
  Was the area supervised?       [ ] Yes  [ ] No
  Supervisor on duty:            [SUPERVISOR_NAME]

  Description of what happened (use continuation sheet if necessary):
  Describe the events leading up to, during, and after the incident in
  chronological order. Include what the person was doing, what equipment was
  being used, and what went wrong.

  [FULL_INCIDENT_DESCRIPTION]

================================================================================
  SECTION 4 — INJURY / ILL HEALTH DETAILS
================================================================================

  Nature of Injury (tick all that apply):
  [ ] Cut / laceration            [ ] Bruise / contusion
  [ ] Fracture                    [ ] Burn (thermal)
  [ ] Burn (chemical)             [ ] Sprain / strain
  [ ] Dislocation                 [ ] Concussion
  [ ] Electric shock              [ ] Crush injury
  [ ] Amputation                  [ ] Loss of consciousness
  [ ] Respiratory irritation      [ ] Skin reaction / dermatitis
  [ ] Eye injury                  [ ] Psychological / shock
  [ ] Multiple injuries           [ ] Fatal
  [ ] Other: [OTHER_INJURY_TYPE]

  Part of Body Affected:
  [ ] Head / face     [ ] Eyes          [ ] Neck
  [ ] Shoulder        [ ] Arm / elbow   [ ] Wrist / hand / fingers
  [ ] Chest / ribs    [ ] Back (upper)  [ ] Back (lower)
  [ ] Abdomen         [ ] Hip / pelvis  [ ] Leg / knee
  [ ] Ankle / foot    [ ] Multiple areas
  [ ] Internal        [ ] Other: [OTHER_BODY_PART]

  Side: [ ] Left  [ ] Right  [ ] Both  [ ] N/A

================================================================================
  SECTION 5 — TREATMENT AND ABSENCE
================================================================================

  First Aid Given:
  [ ] Yes  [ ] No

  First Aid Details:
  [FIRST_AID_DETAILS]

  First Aider Name: [FIRST_AIDER_NAME]

  Further Treatment:
  [ ] None required
  [ ] Sent to hospital (A&E)
  [ ] Sent to GP
  [ ] Ambulance called
  [ ] Self-referred to own GP/hospital later
  Hospital/GP Name: [HOSPITAL_GP_NAME]

  Absence from Work:
  [ ] No absence — returned to normal duties
  [ ] Light duties / restricted work
  [ ] Absent from work
  First day of absence: [FIRST_ABSENCE_DATE]
  Date returned to work: [RETURN_DATE]
  Total days absent: [DAYS_ABSENT]

  Over 7 consecutive days incapacitation (not counting day of accident)?
  [ ] Yes — RIDDOR REPORTABLE  [ ] No

================================================================================
  SECTION 6 — WITNESSES
================================================================================

  | Name | Contact Number | Statement Taken? |
  |------|---------------|-----------------|
  | [WITNESS_1_NAME] | [WITNESS_1_PHONE] | [ ] Yes  [ ] No |
  | [WITNESS_2_NAME] | [WITNESS_2_PHONE] | [ ] Yes  [ ] No |
  | [WITNESS_3_NAME] | [WITNESS_3_PHONE] | [ ] Yes  [ ] No |

================================================================================
  SECTION 7 — IMMEDIATE AND ROOT CAUSES
================================================================================

  Immediate Cause(s) (what directly caused the incident):
  [ ] Slip on wet/contaminated floor
  [ ] Trip over obstacle/cable/equipment
  [ ] Fall from height
  [ ] Struck by falling object
  [ ] Contact with harmful substance
  [ ] Manual handling — incorrect technique
  [ ] Equipment failure / defect
  [ ] Electrical contact
  [ ] Violence / aggression from third party
  [ ] Sharps / needlestick injury
  [ ] Road traffic accident (work-related travel)
  [ ] Other: [OTHER_IMMEDIATE_CAUSE]

  Root Cause(s) (underlying reasons):
  [ ] Inadequate risk assessment
  [ ] Inadequate training or supervision
  [ ] Failure to follow safe system of work / method statement
  [ ] Defective equipment not reported or replaced
  [ ] Inadequate PPE provided or not worn
  [ ] Poor housekeeping
  [ ] Inadequate communication
  [ ] Fatigue / distraction
  [ ] Insufficient staffing
  [ ] Client-side hazard not communicated
  [ ] Other: [OTHER_ROOT_CAUSE]

  Full Analysis:
  [ROOT_CAUSE_ANALYSIS]

================================================================================
  SECTION 8 — RIDDOR ASSESSMENT
================================================================================

  Is this incident RIDDOR reportable? Tick if any apply:

  [ ] Death of any person (report immediately — within 24 hours by phone
      and within 10 days online)
  [ ] Specified injury to a worker (Reg. 4):
      [ ] Fracture (other than fingers, thumbs, or toes)
      [ ] Amputation
      [ ] Crush injury leading to internal organ damage
      [ ] Scalping
      [ ] Burns covering >10% of body or causing damage to eyes,
          respiratory system, or other vital organs
      [ ] Loss of consciousness from head injury or asphyxia
      [ ] Hypothermia, heat illness, or unconsciousness from electric shock
  [ ] Over 7 days incapacitation (worker unable to do normal duties for
      more than 7 consecutive days, not counting day of accident —
      report within 15 days)
  [ ] Injury to a non-worker taken to hospital for treatment
  [ ] Occupational disease (Reg. 8) — e.g., occupational dermatitis,
      occupational asthma, carpal tunnel syndrome
  [ ] Dangerous occurrence (Reg. 7 and Schedule 2) — e.g., collapse of
      scaffold, electrical incident causing fire, release of substance

  RIDDOR Reported:  [ ] Yes  [ ] No  [ ] N/A
  Date Reported:    [RIDDOR_REPORT_DATE]
  Method:           [ ] Online (www.hse.gov.uk/riddor)  [ ] Phone (0345 300 9923)
  HSE Reference:    [HSE_REFERENCE_NUMBER]
  Reported By:      [RIDDOR_REPORTER_NAME]

================================================================================
  SECTION 9 — CORRECTIVE AND PREVENTIVE ACTIONS
================================================================================

  | Action Required | Priority | Responsible Person | Target Date | Completed Date |
  |----------------|----------|-------------------|-------------|---------------|
  | [ACTION_1] | [ ] Immediate  [ ] Within 7 days  [ ] Within 30 days | [PERSON_1] | [TARGET_1] | [COMPLETE_1] |
  | [ACTION_2] | [ ] Immediate  [ ] Within 7 days  [ ] Within 30 days | [PERSON_2] | [TARGET_2] | [COMPLETE_2] |
  | [ACTION_3] | [ ] Immediate  [ ] Within 7 days  [ ] Within 30 days | [PERSON_3] | [TARGET_3] | [COMPLETE_3] |
  | [ACTION_4] | [ ] Immediate  [ ] Within 7 days  [ ] Within 30 days | [PERSON_4] | [TARGET_4] | [COMPLETE_4] |

  Risk assessment(s) to be reviewed:
  [ ] [RISK_ASSESSMENT_REF_1]
  [ ] [RISK_ASSESSMENT_REF_2]

  Method statement(s) to be reviewed:
  [ ] [METHOD_STATEMENT_REF_1]

================================================================================
  SECTION 10 — PHOTOGRAPHS AND EVIDENCE
================================================================================

  Photographs taken:  [ ] Yes  [ ] No
  If yes, by whom:    [PHOTOGRAPHER_NAME]
  Number of photos:   [NUMBER_OF_PHOTOS]
  Storage location:   [PHOTO_STORAGE]

  Equipment/substance preserved for inspection: [ ] Yes  [ ] No
  Details: [PRESERVATION_DETAILS]

  Other evidence: [OTHER_EVIDENCE]

================================================================================
  SECTION 11 — SIGN-OFF
================================================================================

  Report Completed By:
  Name:       [REPORTER_NAME]
  Position:   [REPORTER_POSITION]
  Signature:  [REPORTER_SIGNATURE]
  Date:       [REPORT_DATE]

  Manager / Director Review:
  Name:       [MANAGER_NAME]
  Position:   [MANAGER_POSITION]
  Signature:  [MANAGER_SIGNATURE]
  Date:       [MANAGER_REVIEW_DATE]

  Injured Person Acknowledgement (where applicable):
  Name:       [INJURED_PERSON_NAME]
  Signature:  [INJURED_PERSON_SIGNATURE]
  Date:       [INJURED_PERSON_DATE]

  RECORD RETENTION: This form must be retained for a minimum of 3 years
  from the date of the incident (RIDDOR Reg. 12). {COMPANY_LEGAL} policy
  is to retain for 6 years (40 years for incidents involving asbestos or
  ionising radiation). For incidents involving persons under 18 at the time,
  retain until the person reaches age 21.

================================================================================
  {COMPANY_FULL}
  Ref: RIDDOR 2013 | Health and Safety at Work etc. Act 1974
  HSE Accident Book (BI 510)
  HSE RIDDOR Reporting: www.hse.gov.uk/riddor | 0345 300 9923
================================================================================
"""

# ===================================================================
# 11. HEALTH AND SAFETY POLICY
# ===================================================================
TEMPLATES["health_and_safety_policy"] = f"""
================================================================================
  HEALTH AND SAFETY POLICY
  {COMPANY_FULL}
================================================================================

  Document Reference:  HSP/001
  Date Issued:         [DATE_ISSUED]
  Review Date:         [REVIEW_DATE]
  Version:             [VERSION_NUMBER]

  Legal Basis: Health and Safety at Work etc. Act 1974, Section 2(3)
  (Employers with 5 or more employees must prepare a written H&S policy)

================================================================================
  PART 1 — STATEMENT OF GENERAL POLICY ON HEALTH AND SAFETY AT WORK
================================================================================

  {COMPANY_LEGAL}, trading as {COMPANY_TRADING}, recognises and accepts its
  responsibilities as an employer under the Health and Safety at Work etc.
  Act 1974 and all associated regulations.

  The health, safety, and welfare of our employees, subcontractors, clients,
  and members of the public who may be affected by our operations is of
  paramount importance. We are committed to providing and maintaining a safe
  and healthy working environment.

  This policy sets out our commitment to:

  1. Provide and maintain safe plant, equipment, and systems of work
  2. Ensure the safe handling, storage, and transport of articles and
     substances (COSHH compliance)
  3. Provide adequate information, instruction, training, and supervision
     to ensure the health and safety of all employees
  4. Maintain safe access to and egress from all places of work
  5. Provide and maintain a safe and healthy working environment with
     adequate welfare facilities
  6. Carry out and regularly review risk assessments for all work activities
  7. Consult with employees on matters affecting their health and safety
  8. Provide adequate resources (financial, human, and technical) to
     implement this policy
  9. Comply with all applicable health and safety legislation, approved
     codes of practice, and industry guidance
  10. Continuously improve our health and safety performance

  This policy applies to all employees, subcontractors, agency workers,
  and any person working under the control of {COMPANY_LEGAL}.

  Overall responsibility for health and safety rests with the Director.
  All employees have a duty to cooperate with the company on health and
  safety matters and to take reasonable care of themselves and others.

  This policy will be reviewed at least annually, or sooner if there are
  changes in legislation, working practices, or following a significant
  incident.

  Signed:     [DIRECTOR_SIGNATURE]
  Name:       [DIRECTOR_NAME]
  Position:   Director, {COMPANY_LEGAL}
  Date:       [SIGNATURE_DATE]

================================================================================
  PART 2 — ORGANISATION AND RESPONSIBILITIES
================================================================================

  2.1 DIRECTOR — [DIRECTOR_NAME]

  The Director has overall and final responsibility for health and safety.
  Specific duties include:
  - Ensuring adequate resources are available for health and safety
  - Reviewing the health and safety policy annually
  - Ensuring compliance with legislation
  - Leading by example in health and safety matters
  - Reviewing accident/incident statistics and trends
  - Appointing competent persons to assist with health and safety
  - Ensuring adequate insurance cover (Employers' Liability — compulsory)

  2.2 OPERATIONS MANAGER — [OPS_MANAGER_NAME]

  Day-to-day responsibility for ensuring the policy is implemented:
  - Ensuring risk assessments and method statements are prepared and reviewed
  - Ensuring COSHH assessments are current for all substances used
  - Arranging health and safety training and maintaining training records
  - Investigating accidents, incidents, and near misses
  - Reporting RIDDOR-reportable events to the HSE
  - Conducting site inspections and audits
  - Ensuring equipment is maintained and PAT tested
  - Managing PPE provision and records
  - Maintaining the accident book and incident records
  - Consulting with staff on health and safety matters
  - Ensuring new starters complete the company induction

  2.3 SUPERVISORS / TEAM LEADERS

  Supervisors are responsible for health and safety in their area:
  - Ensuring safe systems of work are followed on site
  - Conducting pre-start checks and site assessments
  - Ensuring staff have and use appropriate PPE
  - Reporting hazards, defects, and incidents promptly
  - Ensuring new staff are site-inducted before commencing work
  - Monitoring staff wellbeing, especially lone workers
  - Ensuring chemicals are used safely and at correct dilutions
  - Maintaining cleaning standards without compromising safety

  2.4 ALL EMPLOYEES

  Under Section 7 of the Health and Safety at Work etc. Act 1974, all
  employees must:
  - Take reasonable care of their own health and safety and that of others
  - Cooperate with the company on health and safety matters
  - Use equipment and substances in accordance with training and instructions
  - Report any hazards, defects, accidents, or near misses immediately
  - Wear PPE as required and report any damage or deficiency
  - Not interfere with or misuse anything provided for health and safety
  - Attend health and safety training as required
  - Follow risk assessments, method statements, and safe systems of work
  - Not undertake any task they have not been trained for

  2.5 COMPETENT PERSON (Health and Safety Assistance)

  In accordance with Regulation 7 of the Management of Health and Safety
  at Work Regulations 1999:
  Competent Person: [COMPETENT_PERSON_NAME]
  Qualifications:   [COMPETENT_PERSON_QUALIFICATIONS]
  Contact:          [COMPETENT_PERSON_CONTACT]

================================================================================
  PART 3 — ARRANGEMENTS
================================================================================

  3.1 RISK ASSESSMENT

  Risk assessments will be carried out for all work activities in accordance
  with Regulation 3 of the Management of Health and Safety at Work
  Regulations 1999.

  - Generic risk assessments maintained for standard cleaning activities
  - Site-specific risk assessments completed for each client site
  - Specific risk assessments for: COSHH, manual handling, work at height,
    lone working, slips/trips/falls, display screen equipment
  - Risk assessments reviewed annually or following an incident, change in
    work practice, or new information
  - Significant findings recorded and communicated to relevant staff
  - Young persons (under 18) assessed before commencing work (Reg. 19)
  - New or expectant mothers assessed (Reg. 16)

  3.2 COSHH (Control of Substances Hazardous to Health)

  - COSHH assessments completed for all hazardous substances used
  - Safety Data Sheets obtained and maintained for all chemicals
  - Less hazardous alternatives considered before use (substitution)
  - Staff trained in safe handling, use, storage, and disposal
  - Chemical safety summary cards available at point of use
  - PPE provided as identified in COSHH assessments
  - Chemicals stored securely in designated areas
  - NEVER mix chemicals — strictly prohibited
  - Emergency spillage procedures in place

  3.3 PERSONAL PROTECTIVE EQUIPMENT (PPE)

  PPE provided free of charge in accordance with the Personal Protective
  Equipment at Work Regulations 1992 (as amended 2022):
  - PPE hazard assessment conducted for all roles
  - PPE issued and recorded on individual PPE Assessment Records
  - Staff trained in correct use, storage, and maintenance of PPE
  - PPE replaced when worn, damaged, or at end of service life
  - PPE use monitored and enforced by supervisors

  Standard PPE for cleaning operatives:
  - Non-slip safety footwear (EN ISO 20345)
  - Chemical-resistant gloves (nitrile — EN 374)
  - Safety goggles (EN 166) — when decanting chemicals or using spray
    products above head height
  - Company uniform / tabard

  3.4 TRAINING

  All employees will receive adequate health and safety training:

  On recruitment:
  - Company health and safety induction (documented on induction checklist)
  - Site-specific induction for each work location
  - COSHH awareness
  - Manual handling
  - Slip prevention
  - PPE use
  - Fire safety and emergency procedures
  - Lone working procedure (where applicable)
  - Accident and incident reporting

  Ongoing:
  - Annual refresher training
  - Toolbox talks (monthly)
  - Training when new equipment, chemicals, or procedures are introduced
  - First aid training (appointed person as minimum)
  - Additional training as identified by risk assessment

  Training records maintained for all employees. Records retained for
  duration of employment plus 6 years.

  3.5 FIRST AID

  In accordance with the Health and Safety (First-Aid) Regulations 1981:
  - First aid needs assessment completed for all work sites
  - Appointed person(s) designated for each shift
  - First aid kits provided and checked monthly
  - First aid kit locations communicated to all staff
  - Contents replenished after use
  - Emergency procedures displayed

  3.6 FIRE SAFETY

  In accordance with the Regulatory Reform (Fire Safety) Order 2005:
  - Fire risk assessment completed for company premises
  - Staff trained in fire procedures for each site they work at
  - Emergency exits identified and kept clear
  - Fire assembly point identified at each site
  - No interference with fire safety equipment
  - Fire doors kept closed
  - Staff to evacuate immediately on hearing fire alarm

  3.7 LONE WORKING

  - Lone working risk assessment completed for all lone working situations
  - Check-in / check-out procedure implemented
  - Lone worker device / app issued where required
  - Escalation procedure in place for overdue check-outs
  - Task restrictions in place for lone workers
  - Under 18s and new starters (first 4 weeks) prohibited from lone working

  3.8 ACCIDENT AND INCIDENT REPORTING

  - All accidents, incidents, near misses, and cases of ill health reported
    using the company Accident & Incident Report Form
  - RIDDOR-reportable events reported to the HSE within statutory timescales
  - All incidents investigated to identify root cause
  - Corrective and preventive actions documented and tracked
  - Accident/incident statistics reviewed quarterly by management
  - Trends analysed and action taken to prevent recurrence

  3.9 CONSULTATION WITH EMPLOYEES

  In accordance with the Health and Safety (Consultation with Employees)
  Regulations 1996:
  - Employees consulted on health and safety matters
  - Risk assessments shared and discussed with affected staff
  - Feedback and suggestions welcomed and acted upon
  - Staff involved in incident investigations where appropriate
  - Any changes to procedures communicated before implementation

  3.10 MONITORING AND REVIEW

  - Workplace inspections conducted monthly by supervisor
  - Management health and safety review conducted quarterly
  - External health and safety audit conducted annually
  - Policy reviewed annually or following significant changes
  - Performance measured against objectives and targets
  - Non-conformances tracked and closed out

  3.11 WORK EQUIPMENT (PUWER)

  In accordance with the Provision and Use of Work Equipment Regulations 1998:
  - All equipment maintained in safe working condition
  - Portable Appliance Testing (PAT) conducted annually
  - Pre-use visual inspections carried out daily
  - Defective equipment removed from use and labelled
  - Equipment used only for its intended purpose
  - Guards and safety devices maintained in position

  3.12 MANUAL HANDLING

  In accordance with the Manual Handling Operations Regulations 1992:
  - Manual handling assessments completed for relevant tasks
  - Manual handling minimised or avoided where possible
  - Mechanical aids provided (trolleys, sack trucks, wheeled bins)
  - Staff trained in correct manual handling techniques
  - Maximum load limits observed (individual assessment where required)

  3.13 WELFARE

  In accordance with the Workplace (Health, Safety and Welfare) Regulations
  1992, and so far as is reasonably practicable:
  - Access to welfare facilities (toilets, washing, drinking water, rest
    area) at or near each work site
  - Arrangements for staff working at client premises agreed with client
  - Adequate breaks provided in accordance with Working Time Regulations 1998

================================================================================
  PART 4 — DOCUMENT CONTROL
================================================================================

  | Version | Date | Author | Changes | Approved By |
  |---------|------|--------|---------|-------------|
  | [V1] | [DATE_1] | [AUTHOR_1] | Initial issue | [APPROVER_1] |
  | [V2] | [DATE_2] | [AUTHOR_2] | [CHANGES_2] | [APPROVER_2] |
  | [V3] | [DATE_3] | [AUTHOR_3] | [CHANGES_3] | [APPROVER_3] |

  Distribution:
  - All employees (copy provided on induction, available on request)
  - Company office (master copy)
  - Client sites (on request)
  - Company website / intranet

================================================================================
  {COMPANY_FULL}
  Registered Office: [REGISTERED_OFFICE_ADDRESS]
  Company Registration No: [COMPANY_REG_NUMBER]
  Employers' Liability Insurance: [INSURANCE_PROVIDER] Policy No: [POLICY_NUMBER]
  Public Liability Insurance: [PL_INSURANCE_PROVIDER] Policy No: [PL_POLICY_NUMBER]
================================================================================
"""

# ===================================================================
# 12. INDUCTION CHECKLIST
# ===================================================================
TEMPLATES["induction_checklist"] = f"""
================================================================================
  NEW STARTER INDUCTION CHECKLIST
  {COMPANY_FULL}
================================================================================

  Document Reference:  IND/[REFERENCE_NUMBER]
  Employee Name:       [EMPLOYEE_NAME]
  Start Date:          [START_DATE]
  Job Title/Role:      [JOB_TITLE]
  Assigned Site(s):    [ASSIGNED_SITES]
  Supervisor:          [SUPERVISOR_NAME]
  Inducted By:         [INDUCTED_BY]

  Legal Basis: Health and Safety at Work etc. Act 1974
               Management of Health and Safety at Work Regulations 1999,
               Regulation 13 — Capabilities and training

  This induction must be completed BEFORE the employee commences unsupervised
  work. All items must be ticked and signed. Any items marked N/A must have
  a justification noted.

================================================================================
  PART A — COMPANY INDUCTION (Health & Safety)
================================================================================

  Completed by: [INDUCTOR_NAME]  Date: [INDUCTION_DATE]

  | # | Topic | Completed | Notes |
  |---|-------|-----------|-------|
  | 1 | Company health and safety policy explained | [ ] | |
  | 2 | Employee responsibilities under H&S at Work Act 1974 (Section 7) | [ ] | |
  | 3 | Reporting structure and key contacts (supervisor, manager, director) | [ ] | |
  | 4 | Accident and incident reporting procedure | [ ] | |
  | 5 | Location of accident book / how to complete report form | [ ] | |
  | 6 | First aid arrangements — first aiders, kit locations | [ ] | |
  | 7 | Fire safety — alarms, extinguishers, assembly points, evacuation | [ ] | |
  | 8 | Emergency procedures — what to do in an emergency | [ ] | |
  | 9 | COSHH awareness — chemical safety, SDS, never mix chemicals | [ ] | |
  | 10 | Colour-coding system (Red/Blue/Green/Yellow) explained | [ ] | |
  | 11 | Safe use of cleaning chemicals — dilution, labelling, storage | [ ] | |
  | 12 | Manual handling — correct lifting techniques, limits, mechanical aids | [ ] | |
  | 13 | Slip, trip, and fall prevention — wet floor signs, cable management | [ ] | |
  | 14 | PPE — issued, correct use, care, replacement procedure | [ ] | |
  | 15 | Work equipment — safe use, pre-use checks, reporting defects | [ ] | |
  | 16 | Electrical safety — PAT testing, visual checks, damaged cables | [ ] | |
  | 17 | Work at height policy — no standing on chairs/desks, ladder rules | [ ] | |
  | 18 | Lone working policy and procedure (if applicable) | [ ] | |
  | 19 | Check-in / check-out system explained and tested | [ ] | |
  | 20 | Sharps and needlestick procedure | [ ] | |
  | 21 | Bodily fluid clean-up procedure | [ ] | |
  | 22 | Welfare facilities — toilets, rest area, drinking water | [ ] | |
  | 23 | Working hours, breaks, and rest periods (Working Time Regs 1998) | [ ] | |
  | 24 | Smoking, alcohol, and drugs policy | [ ] | |
  | 25 | Bullying and harassment policy | [ ] | |
  | 26 | Disciplinary and grievance procedure | [ ] | |
  | 27 | Safeguarding and DBS (if working in sensitive environments) | [ ] | |
  | 28 | Data protection and confidentiality (GDPR) | [ ] | |
  | 29 | Company vehicle policy (if applicable) | [ ] | |
  | 30 | Uniform and appearance standards | [ ] | |

================================================================================
  PART B — SITE-SPECIFIC INDUCTION
================================================================================

  Site Name:    [SITE_NAME]
  Site Address: [SITE_ADDRESS]
  Client:       [CLIENT_NAME]
  Completed by: [SITE_INDUCTOR]  Date: [SITE_INDUCTION_DATE]

  | # | Topic | Completed | Notes |
  |---|-------|-----------|-------|
  | 1 | Site access procedure (keys, codes, access cards, sign-in) | [ ] | |
  | 2 | Site alarm system — setting and unsetting procedure | [ ] | |
  | 3 | Fire alarm — type of alarm, action on activation | [ ] | |
  | 4 | Fire exits and assembly point for this site | [ ] | |
  | 5 | First aid kit location at this site | [ ] | |
  | 6 | Client health and safety rules for this site | [ ] | |
  | 7 | Areas to be cleaned — tour of all areas | [ ] | |
  | 8 | Cleaning specification for this site explained | [ ] | |
  | 9 | Equipment and chemical storage location | [ ] | |
  | 10 | Waste disposal and segregation for this site | [ ] | |
  | 11 | Restricted areas — where not to go | [ ] | |
  | 12 | Security and confidentiality requirements | [ ] | |
  | 13 | Communication with client staff and visitors | [ ] | |
  | 14 | Special hazards at this site (asbestos register, restricted areas) | [ ] | |
  | 15 | Emergency contact numbers for this site | [ ] | |
  | 16 | Reporting procedure — who to contact for issues | [ ] | |

================================================================================
  PART C — PPE ISSUED
================================================================================

  | PPE Item | Size | Issued | Employee Signature |
  |----------|------|--------|--------------------|
  | Non-slip safety footwear | [SIZE] | [ ] | [SIG] |
  | Chemical-resistant gloves (nitrile) | [SIZE] | [ ] | [SIG] |
  | Safety goggles | N/A | [ ] | [SIG] |
  | Company uniform / tabard | [SIZE] | [ ] | [SIG] |
  | Hi-vis vest (if required) | [SIZE] | [ ] | [SIG] |
  | Other: [OTHER_PPE] | [SIZE] | [ ] | [SIG] |

  Employee has been trained in correct use, care, and storage of all PPE
  issued: [ ] Yes

================================================================================
  PART D — DOCUMENTATION PROVIDED
================================================================================

  | Document | Provided | Employee Signature |
  |----------|----------|--------------------|
  | Employee handbook | [ ] | [SIG] |
  | Health and safety policy (summary) | [ ] | [SIG] |
  | Contract of employment | [ ] | [SIG] |
  | COSHH safety cards for site chemicals | [ ] | [SIG] |
  | Method statement for the site | [ ] | [SIG] |
  | Lone working procedure (if applicable) | [ ] | [SIG] |
  | Emergency contact card | [ ] | [SIG] |

================================================================================
  PART E — CONFIRMATION AND SIGN-OFF
================================================================================

  Employee Declaration:
  I confirm that I have received the above induction. I understand my
  responsibilities for health and safety as explained during this induction.
  I will follow the company health and safety policy, risk assessments, and
  method statements. I will report any hazards, incidents, or concerns to
  my supervisor immediately.

  Employee Name:      [EMPLOYEE_NAME]
  Employee Signature: [EMPLOYEE_SIGNATURE]
  Date:               [EMPLOYEE_SIGN_DATE]

  Inductor Declaration:
  I confirm that I have delivered the above induction to the named employee
  and am satisfied that they have understood the key health and safety
  requirements for their role.

  Inductor Name:      [INDUCTOR_NAME]
  Inductor Signature: [INDUCTOR_SIGNATURE]
  Position:           [INDUCTOR_POSITION]
  Date:               [INDUCTOR_SIGN_DATE]

  Manager Sign-Off:
  Name:       [MANAGER_NAME]
  Signature:  [MANAGER_SIGNATURE]
  Date:       [MANAGER_SIGN_DATE]

  RECORD RETENTION: Induction records retained for duration of employment
  plus 6 years.

================================================================================
  {COMPANY_FULL}
  Ref: Health and Safety at Work etc. Act 1974
  Management of Health and Safety at Work Regulations 1999, Reg. 13
================================================================================
"""

# ===================================================================
# 13. PPE ASSESSMENT RECORD
# ===================================================================
TEMPLATES["ppe_assessment_record"] = f"""
================================================================================
  PPE HAZARD ASSESSMENT AND ISSUE RECORD
  {COMPANY_FULL}
================================================================================

  Document Reference:  PPE/[REFERENCE_NUMBER]
  Assessment Date:     [ASSESSMENT_DATE]
  Review Date:         [REVIEW_DATE]
  Assessor:            [ASSESSOR_NAME]

  Legal Basis: Personal Protective Equipment at Work Regulations 1992
               (as amended 2022)
               Health and Safety at Work etc. Act 1974

  Note: PPE is the LAST resort in the hierarchy of control. It must only
  be relied upon after elimination, substitution, engineering controls, and
  administrative controls have been considered.

================================================================================
  SECTION 1 — JOB ROLE ASSESSMENT
================================================================================

  Job Role Assessed:    [JOB_ROLE]
  Tasks Performed:      [TASK_DESCRIPTION]
  Work Location(s):     [WORK_LOCATIONS]

  Hazards identified requiring PPE:

  | Hazard | Body Part at Risk | Risk Without PPE | PPE Required |
  |--------|------------------|-----------------|-------------|
  | Chemical splash (cleaning chemicals) | Hands | Skin irritation, dermatitis, burns | Chemical-resistant gloves (nitrile, EN 374) |
  | Chemical splash (decanting/spraying) | Eyes | Irritation, chemical burns | Safety goggles (EN 166) |
  | Slip on wet floors | Feet | Fractures, sprains, bruising | Non-slip safety footwear (EN ISO 20345, SRC rated) |
  | Sharp objects in waste | Hands | Cuts, puncture wounds, infection | Heavy-duty gloves for waste handling |
  | Biological hazards (washrooms) | Hands, body | Infection, disease | Nitrile gloves, disposable apron |
  | Dust/aerosol (spray products) | Respiratory | Irritation, sensitisation | RPE (FFP2) if ventilation inadequate |
  | Floor stripping chemicals | Hands, eyes, skin | Chemical burns | Goggles, gauntlet gloves, apron |
  | Work at height (debris) | Head | Head injury | Hard hat (if overhead risks) |
  | External work | Body | Hypothermia, visibility | Hi-vis vest, waterproof jacket |
  | Noise (floor machines) | Ears | Hearing damage | Ear defenders/plugs (if >80dB) |

================================================================================
  SECTION 2 — PPE SPECIFICATION
================================================================================

  2.1 HAND PROTECTION

  General Cleaning:
  - Type: Nitrile disposable gloves
  - Standard: EN 374 (chemical resistance), EN 388 (mechanical resistance)
  - Colour: Blue (general) / Red packaging (washroom)
  - Size range: S, M, L, XL
  - Supplier: [GLOVE_SUPPLIER]
  - Product: [GLOVE_PRODUCT_NAME]
  - Change frequency: After each task area / when torn or contaminated

  Heavy-Duty (floor stripping, deep clean):
  - Type: Reusable chemical gauntlet gloves
  - Standard: EN 374
  - Material: [GAUNTLET_MATERIAL]
  - Supplier: [GAUNTLET_SUPPLIER]

  2.2 EYE PROTECTION

  - Type: Safety goggles (indirect ventilation)
  - Standard: EN 166
  - Anti-fog coating: Yes
  - Supplier: [GOGGLES_SUPPLIER]
  - Product: [GOGGLES_PRODUCT_NAME]
  - Required when: Decanting chemicals, using spray products above head
    height, using floor stripping chemicals, descaling

  2.3 FOOT PROTECTION

  - Type: Safety shoes/boots with non-slip sole
  - Standard: EN ISO 20345, minimum S2 rating, SRC slip resistance
  - Toe protection: Steel or composite toe cap
  - Supplier: [FOOTWEAR_SUPPLIER]
  - Product: [FOOTWEAR_PRODUCT_NAME]
  - Replacement: When sole tread is worn or upper is damaged

  2.4 BODY PROTECTION

  - Company uniform / tabard: Supplied by company
  - Disposable apron: For bodily fluid clean-up and heavy washroom work
  - Waterproof jacket: For external work
  - Hi-vis vest: For work near traffic, car parks, external areas
  - Chemical-resistant apron: For floor stripping and deep clean chemicals

  2.5 RESPIRATORY PROTECTION (where required by COSHH assessment)

  - Type: FFP2 disposable mask (minimum)
  - Standard: EN 149
  - Required when: Ventilation is inadequate during chemical use,
    dusty conditions, as specified in COSHH assessment
  - Face fit testing: Required for RPE — record of fit test held
  - Supplier: [RPE_SUPPLIER]

  2.6 HEARING PROTECTION (where required by noise assessment)

  - Type: Foam ear plugs / ear defenders
  - Standard: EN 352
  - Required when: Using floor machines or pressure washers exceeding 80dB
  - Supplier: [HEARING_SUPPLIER]

================================================================================
  SECTION 3 — INDIVIDUAL ISSUE RECORD
================================================================================

  Employee Name:       [EMPLOYEE_NAME]
  Employee Number:     [EMPLOYEE_NUMBER]
  Job Role:            [JOB_ROLE]
  Start Date:          [START_DATE]

  | PPE Item | Size | Date Issued | Condition | Employee Signature |
  |----------|------|-------------|-----------|-------------------|
  | Safety footwear | [SIZE] | [DATE] | New | [SIG] |
  | Nitrile gloves (box) | [SIZE] | [DATE] | New | [SIG] |
  | Safety goggles | N/A | [DATE] | New | [SIG] |
  | Company tabard | [SIZE] | [DATE] | New | [SIG] |
  | Hi-vis vest | [SIZE] | [DATE] | New | [SIG] |
  | [OTHER_PPE_1] | [SIZE] | [DATE] | [COND] | [SIG] |
  | [OTHER_PPE_2] | [SIZE] | [DATE] | [COND] | [SIG] |

  Replacement Record:

  | PPE Item | Date Returned/Disposed | Reason | Replacement Issued | Signature |
  |----------|----------------------|--------|-------------------|-----------|
  | [ITEM_1] | [DATE_1] | [REASON_1] | [ ] Yes | [SIG_1] |
  | [ITEM_2] | [DATE_2] | [REASON_2] | [ ] Yes | [SIG_2] |

================================================================================
  SECTION 4 — TRAINING RECORD
================================================================================

  | Training Topic | Date | Trainer | Employee Signature |
  |---------------|------|---------|-------------------|
  | Correct use and fitting of all issued PPE | [DATE] | [TRAINER] | [SIG] |
  | Care, maintenance, and storage of PPE | [DATE] | [TRAINER] | [SIG] |
  | Limitations of PPE (what it does and does not protect against) | [DATE] | [TRAINER] | [SIG] |
  | Procedure for reporting damaged/defective PPE | [DATE] | [TRAINER] | [SIG] |
  | RPE face fit test (if applicable) | [DATE] | [TRAINER] | [SIG] |

================================================================================
  SECTION 5 — EMPLOYEE DECLARATION
================================================================================

  I confirm that:
  - I have been issued the PPE listed above
  - I have been trained in its correct use, care, and storage
  - I understand that I must wear PPE as required by risk assessments
    and method statements
  - I will report any damage, defect, or loss of PPE to my supervisor
    immediately
  - I understand that failure to wear required PPE is a disciplinary matter
  - I will return all PPE on termination of employment

  Employee Name:      [EMPLOYEE_NAME]
  Employee Signature: [EMPLOYEE_SIGNATURE]
  Date:               [EMPLOYEE_SIGN_DATE]

================================================================================
  SECTION 6 — SIGN-OFF
================================================================================

  Assessed By:
  Name:       [ASSESSOR_NAME]
  Position:   [ASSESSOR_POSITION]
  Signature:  [ASSESSOR_SIGNATURE]
  Date:       [ASSESSMENT_DATE]

  Approved By:
  Name:       [APPROVER_NAME]
  Position:   [APPROVER_POSITION]
  Signature:  [APPROVER_SIGNATURE]
  Date:       [APPROVAL_DATE]

  Next Review Date: [REVIEW_DATE]

================================================================================
  {COMPANY_FULL}
  Ref: Personal Protective Equipment at Work Regulations 1992 (as amended 2022)
  Health and Safety at Work etc. Act 1974
  HSE INDG174 — Personal protective equipment (PPE) at work
================================================================================
"""


# ---------------------------------------------------------------------------
# API FUNCTIONS
# ---------------------------------------------------------------------------

def get_template(name: str) -> Optional[str]:
    """
    Retrieve a compliance template by name.

    Args:
        name: Template key (e.g., 'coshh_risk_assessment')

    Returns:
        Template text string, or None if not found.
    """
    return TEMPLATES.get(name)


def list_templates() -> list[dict]:
    """
    List all available compliance templates with their categories.

    Returns:
        List of dicts with 'name', 'category', and 'title' keys.
    """
    results = []
    for key in TEMPLATES:
        title = key.replace("_", " ").title()
        category = TEMPLATE_CATEGORIES.get(key, "General")
        results.append({
            "name": key,
            "category": category,
            "title": title,
        })
    return results


# ---------------------------------------------------------------------------
# FastAPI integration — add these routes to api.py:
#
#   from compliance_templates import TEMPLATES, get_template, list_templates
#
#   @app.get("/api/compliance/templates")
#   def api_list_compliance_templates():
#       return {"templates": list_templates()}
#
#   @app.get("/api/compliance/templates/{name}")
#   def api_get_compliance_template(name: str):
#       tpl = get_template(name)
#       if tpl is None:
#           raise HTTPException(status_code=404, detail=f"Template '{name}' not found")
#       category = TEMPLATE_CATEGORIES.get(name, "General")
#       title = name.replace("_", " ").title()
#       return {"name": name, "category": category, "title": title, "content": tpl}
# ---------------------------------------------------------------------------
