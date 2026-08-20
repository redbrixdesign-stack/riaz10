/* ============================================================
   BEELO LANDING — ALL EDITABLE CONTENT
   Every piece of copy lives here so the page can be edited
   without touching components. Search for "TODO:" to find the
   things you must replace before launch.
   ============================================================ */

export const CONTENT = {
  /* TODO: replace with the real contact email */
  email: 'hello@beelo.co.uk',
  /* TODO: replace with the founder's real name (footer / story) */
  founderName: 'Beelo founder',

  banner: {
    text: 'Beelo is preparing a controlled pilot for solo field professionals.',
    cta: 'Join the pilot'
  },

  hero: {
    /* TODO: replace with the founder's name if you sign the hero */
    eyebrow: 'Beelo · pilot-stage',
    headline: 'Your business should not live in your head.',
    sub: 'Beelo is an offline-capable AI operational-memory tool for solo field professionals. It brings together the customer context, follow-ups, job notes, mileage and reminders that currently sit across disconnected apps, photos and notebooks.',
    ctaPrimary: 'Join the pilot',
    ctaSecondary: 'Talk about a partnership',
    mockupNote: 'Real Beelo screens from a field test — customer context, a message draft and the day calendar.'
  },

  problem: {
    heading: 'Solo workers are not short of apps. They are short of connection.',
    supporting: 'Appointments sit in one system. Conversations sit in WhatsApp. Routes sit in Maps. Photos sit in the camera roll. Receipts sit in a shoebox. The solo advisor becomes the manual integration layer.',
    chain: ['Company diary', 'WhatsApp', 'Maps', 'Camera roll', 'Notes', 'Receipts', 'Mileage app'],
    collapse: 'You remember everything'
  },

  solution: {
    heading: 'One working day. One personal operating memory.',
    items: [
      {
        title: 'Remember the next job',
        body: 'Parking, access, previous notes, photos and promises—when you need them.'
      },
      {
        title: 'Stay in touch',
        body: 'Context-aware drafts for bookings, reminders, delays, quotes, fittings and follow-ups.'
      },
      {
        title: 'Protect the day',
        body: 'Spot tight appointment gaps, capture job scope and avoid avoidable travel.'
      },
      {
        title: 'Keep the records',
        body: 'Mileage, receipts, earnings and deductions captured as part of the working day.'
      }
    ]
  },

  how: {
    heading: 'How it works',
    steps: [
      { title: 'Capture', body: 'Speak, photograph or save what happened.' },
      { title: 'Connect', body: 'Beelo links it to the customer, visit and job.' },
      { title: 'Resurface', body: 'The right context appears before the next action.' },
      { title: 'Decide', body: 'Beelo drafts and recommends. You stay in control.' }
    ]
  },

  builtForOne: {
    heading: 'No office. No dispatcher. No second pair of hands.',
    body: 'Beelo is designed for the person in the van, on the doorstep or on a ladder—not for a manager at a desk. Core capture works offline. Messages are drafted for review, never sent automatically.',
    points: [
      'Voice and photo capture',
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
    heading: 'Support, not takeover.',
    doesTitle: 'Beelo does',
    does: ['Reads documents and voice notes', 'Creates structured context', 'Drafts messages', 'Flags schedule risk', 'Keeps records organised'],
    youTitle: 'You decide',
    you: ['What to send', 'What to change', 'What to confirm', 'What to share', 'What system to use'],
    legal: 'Beelo is not accounting, tax-filing or MTD-compatible filing software. It is designed to make record-keeping easier and exportable.'
  },

  pilot: {
    heading: 'Help shape Beelo before public launch.',
    body: 'We are preparing a small, controlled pilot with solo field professionals who visit customers, manage communication themselves and carry the admin burden alone.',
    criteriaTitle: 'The pilot is for people who:',
    criteria: [
      'Work alone',
      'Visit customers at homes or sites',
      'Use a mixture of messaging, maps, photos, notes and receipts',
      'Want to reduce follow-up and admin burden',
      'Are comfortable giving structured feedback'
    ],
    cta: 'Apply for the pilot',
    /* TODO: replace the form submit endpoint (see src/lib/forms.ts) */
    success: 'Thank you — your application has been received. We will be in touch about the pilot.',
    error: 'Something went wrong sending your application. Please try again, or email us directly.'
  },

  partner: {
    heading: 'Building practical AI for the everyday economy.',
    body: 'Beelo is seeking conversations with business-support organisations, universities, trade networks and responsible-AI partners to validate the product before public launch.',
    cta: 'Partner with Beelo'
  },

  footer: {
    tagline: 'Built for solo field professionals.',
    /* TODO: replace with the real privacy policy URL */
    privacy: 'Privacy policy',
    privacyHref: '#',
    /* TODO: replace with the real LinkedIn URL, or remove the link */
    linkedin: 'LinkedIn',
    linkedinHref: 'https://www.linkedin.com/',
    status: 'Pilot-stage product.'
  }
};

export type Content = typeof CONTENT;
