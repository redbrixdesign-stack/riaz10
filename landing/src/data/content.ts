/* ============================================================
   BEELO LANDING — ALL EDITABLE CONTENT
   Every piece of copy lives here so the page can be edited
   without touching components. Search for "TODO:" to find the
   things you must replace before launch.
   ============================================================ */

export const CONTENT = {
  /* TODO: replace with the real contact email */
  email: 'hello@beelestial.co.uk',
  founderName: 'Muhammad Asif Riaz, self-employed window-coverings advisor and founder of Beelo',

  banner: {
    text: 'UK pilot: applications are open for a small, controlled group of home-visit professionals.',
    cta: 'Apply now'
  },

  hero: {
    eyebrow: 'Built for people who work alone between customer appointments',
    headline: 'The thread connecting your working day.',
    sub: 'Your appointments may come from a company diary, a calendar, a message, paper or a business card. Beelo connects the person, place, time and next action—then works with the tools you already use.',
    boundary: 'Keep your company system. Keep your calendar. Keep your maps. Beelo connects them around you.',
    ctaPrimary: 'Apply for the pilot',
    ctaSecondary: 'See how it works',
    pilotNote: 'Small, controlled UK pilot. Places are limited.',
    proof: ['Core capture works offline', 'You approve every message', 'Built from real field work'],
    mockupNote: 'Prototype Beelo screens from founder field testing.'
  },

  problem: {
    heading: 'Seven tools. One person holding it all together.',
    supporting: 'Appointments sit in one system. Conversations sit in WhatsApp. Routes sit in Maps. Photos sit in the camera roll. The person doing the work becomes the manual integration layer.',
    chain: ['Company diary', 'WhatsApp', 'Maps', 'Camera roll', 'Notes', 'Receipts', 'Mileage app'],
    collapse: 'You become the system that connects everything.'
  },

  thread: {
    heading: 'The tools already work. What is missing is the thread between them.',
    intro: 'Beelo does not replace the useful tools or official systems in your working day. It carries the relevant context between them, centred on the person doing the work.',
    sources: ['Company diary', 'Calendar', 'Paper or card', 'Messages'],
    destinations: ['Contacts', 'Maps', 'Notes', 'Follow-up'],
    centre: 'The personal continuity layer',
    principle: 'The tools remain separate and useful. Beelo provides the continuity.'
  },

  solution: {
    heading: 'The right detail, at the right moment.',
    intro: 'Beelo connects the practical details of a working day around the customer, the visit and the next action—without replacing the tools you already depend on.',
    compatibilityHeading: 'Works around the tools you already use.',
    compatibilityBody: 'Beelo is not another company CRM, booking system or accounting platform. It is a personal working layer that helps connect the context already spread across your diary, messages, maps, photos and records.',
    items: [
      {
        title: 'Know what needs doing next',
        body: 'See who needs contacting, why it matters and what you promised—without searching through old messages.'
      },
      {
        title: 'Arrive with the context',
        body: 'Keep access notes, voice notes, customer details and previous conversations connected to the visit.'
      },
      {
        title: 'Follow up without starting over',
        body: 'Review a message drafted from the information you already captured. Nothing sends automatically.'
      },
      {
        title: 'Carry the memory forward',
        body: 'Keep what happened, what you promised and what must happen next connected to the visit.'
      }
    ]
  },

  how: {
    heading: 'From appointment to next action.',
    steps: [
      { title: 'Capture the appointment', body: 'Scan a company diary, paper record or card—or enter the details manually.' },
      { title: 'Connect the context', body: 'Keep the person, place, time, notes and relevant history together.' },
      { title: 'Prepare the day', body: 'See missing details, conflicts, backtracking and actions that need attention.' },
      { title: 'Use your existing tools', body: 'Open navigation in Maps and review communication drafts before sending.' },
      { title: 'Carry memory forward', body: 'Retain what happened, what was promised and what should happen next.' }
    ]
  },

  routing: {
    heading: 'Maps optimises a journey. Beelo helps organise the whole day.',
    intro: 'Company appointments often remain in the order they were booked. Independent workers also add visits as they arrive. Both can produce unnecessary crossing, backtracking and time on the road.',
    body: 'Beelo is being developed to review the working day around locations, appointment windows and expected duration, then recommend a more practical sequence. The worker reviews the recommendation before changing anything; navigation still happens through the preferred maps app.',
    bookedLabel: 'Order received',
    bookedRoute: 'A → D → B → C',
    suggestedLabel: 'Possible sequence',
    suggestedRoute: 'A → B → C → D',
    control: 'Beelo recommends. You decide. Maps navigates.',
    evidenceTitle: 'Early founder observation',
    evidenceBody: 'During the founder’s own home-visit work, more deliberate appointment sequencing has avoided approximately five miles on an average working day. Across 220 working days, that would represent around 1,100 miles.',
    scale: 'If replicated by 1,000 workers: 1.1 million unnecessary miles could be avoided annually.',
    qualification: 'Founder observation and illustrative extrapolation—not yet a measured result across Beelo users. The pilot must test whether it generalises.',
    impact: 'Fewer unnecessary miles can mean less travel time, lower fuel and vehicle costs, and lower emissions. At sufficient scale, fewer avoidable vehicle-miles could also reduce pressure on local roads.'
  },

  truth: {
    heading: 'What exists now—and what the pilot must prove.',
    intro: 'Beelo is a pilot-stage prototype. Planned and pilot-validation work is labelled clearly rather than presented as released capability.',
    columns: [
      {
        title: 'Verified in the prototype',
        status: 'Available now',
        items: ['Appointment capture and manual entry', 'Connected visit context and next actions', 'Voice note capture within customer profiles', 'Core offline capture', 'User-started trip and mileage records', 'Review-first communication drafts', 'End-of-day review']
      },
      {
        title: 'Being validated',
        status: 'Pilot evidence needed',
        items: ['Reliable capture across varied appointment sources', 'Whole-day route recommendations', 'Measured mileage and time reduction', 'Tomorrow preparation across different occupations', 'Practical use during real working days']
      },
      {
        title: 'Future possibilities',
        status: 'Not current capability',
        items: ['Deeper calendar and company-system connections', 'Broader localisation and international versions', 'Additional permission-based automation', 'Wider device and service integrations']
      }
    ]
  },

  builtForOne: {
    heading: 'Built for the person doing the work.',
    body: 'Beelo is designed for the person in the van, on the doorstep or moving between appointments—not for a manager watching a dashboard. It can support a self-employed professional or someone receiving work through a company system. Core capture works offline and messages are never sent without your approval.',
    points: [
      'Fast photo and note capture',
      'Offline-first',
      'One-handed interaction',
      'No complicated setup',
      'No automatic sending',
      'Your existing systems stay in control'
    ]
  },

  founder: {
    heading: 'Built from the road, not the boardroom.',
    /* TODO: adjust the story to the founder's real background */
    body: 'Beelo began as a tool built by a self-employed home-visit advisor who was trying to keep up with customer communication, job notes, mileage, receipts and commission deductions while working alone. It was built in the gaps between appointments, tested on real jobs and is now being rebuilt for a controlled pilot.',
    /* TODO: replace with the founder's real, consented quote */
    quote: 'I didn\u2019t need another app. I needed the apps I already used to stop making me remember everything.'
  },

  trust: {
    heading: 'AI that helps you remember, not AI that takes over.',
    intro: 'Beelo structures the information you choose to capture, surfaces useful context and prepares drafts for review. It does not make customer decisions or send messages on your behalf.',
    doesTitle: 'Beelo does',
    does: ['Organises notes and documents', 'Creates structured context', 'Drafts messages', 'Flags schedule risk', 'Keeps records organised'],
    youTitle: 'You decide',
    you: ['What to send', 'What to change', 'What to confirm', 'What to share', 'What system to use'],
    legal: 'Beelo is not accounting, tax-filing or MTD-compatible filing software. It is designed to make record-keeping easier and exportable.'
  },

  faq: {
    heading: 'Questions before you join the pilot.',
    intro: 'Straight answers about how Beelo works, what the pilot involves and what stays under your control.',
    items: [
      {
        question: 'What information does Beelo keep?',
        answer: 'Beelo keeps the working information you choose to capture, such as customer notes, visit context, photographs, mileage and next actions. Pilot participants will receive clear information about privacy, retention and deletion before taking part.'
      },
      {
        question: 'Does Beelo contact customers automatically?',
        answer: 'No. Beelo can prepare a draft, but you review, change and approve every message. Nothing is sent behind your back.'
      },
      {
        question: 'Does it work without an internet connection?',
        answer: 'Beelo is being designed so essential capture and retrieval continue when connectivity is poor or unavailable. Features that rely on online services will need a connection.'
      },
      {
        question: 'Which devices will it support?',
        answer: 'Beelo is being developed as a progressive web app for modern smartphones. Confirmed device and browser requirements will be provided before pilot onboarding.'
      },
      {
        question: 'What happens after I apply?',
        answer: 'We will contact you personally to understand your work and confirm whether the pilot is a suitable fit. Applying does not commit you to taking part.'
      },
      {
        question: 'How much does the pilot cost?',
        answer: 'There is no charge to apply. Any pilot costs or participation terms will be explained clearly before you agree to join.'
      }
    ]
  },

  pilot: {
    heading: 'Help shape Beelo before it launches.',
    body: 'We are inviting 5–10 UK-based, self-employed home-visit professionals to use Beelo during real working days and give honest, structured feedback. The pilot will assess whether Beelo can reduce missed follow-ups, minimise unpaid administration time, improve record quality, and increase operational confidence for mobile professionals.',
    criteriaTitle: 'The pilot is for people who:',
    criteria: [
      'Currently live and work in the United Kingdom',
      'Work alone',
      'Visit customers at homes or sites',
      'Juggle messaging, maps, photos, notes or mileage',
      'Want fewer missed follow-ups, less unpaid admin time, better records and more day-to-day confidence',
      'Are comfortable giving structured feedback'
    ],
    cta: 'Apply for the pilot',
    success: 'Thank you — your application has been received. We will be in touch about the pilot.',
    error: 'We could not send your application just now. Please try again or email hello@beelestial.co.uk.',
    reassurance: 'No commitment. We will contact you first to confirm whether the pilot is a good fit.',
    privacy: 'We will only use your details to contact you about the Beelo pilot. We do not sell your information.'
  },

  partner: {
    heading: 'Interested in supporting the Beelo pilot?',
    body: 'We welcome conversations with business-support organisations, trade networks, universities and responsible-AI partners who can help Beelo validate responsibly.',
    cta: 'Start a conversation'
  },

  privacy: {
    heading: 'Your working data deserves clear boundaries.',
    intro: 'BEELESTIAL LTD (company 15297106), Apartment 6, 2 Copper Place, Manchester M14 7FZ, is responsible for the Beelo pilot. Privacy questions and deletion requests can be sent to hello@beelestial.co.uk.',
    items: [
      {
        title: 'Purpose is limited',
        body: 'Pilot application details are used only to assess suitability, contact applicants and administer the Beelo pilot. They are stored in the protected application record and operator email; they are not sold.'
      },
      {
        title: 'Participation is informed',
        body: 'Before onboarding, participants will receive the current app data-flow and retention information. Applicants can ask for access, correction or deletion at hello@beelestial.co.uk.'
      },
      {
        title: 'The person stays in control',
        body: 'Beelo is designed around deliberate capture and user approval. Customer communication is never sent automatically.'
      }
    ]
  },

  footer: {
    tagline: 'Built for people who work alone between customer appointments.',
    /* TODO: replace with the real privacy policy URL */
    privacy: 'Privacy & data handling',
    privacyHref: '#privacy',
    /* TODO: replace with the real LinkedIn URL, or remove the link */
    linkedin: 'LinkedIn',
    linkedinHref: '',
    status: 'Pilot-stage product.'
  }
};

export type Content = typeof CONTENT;
