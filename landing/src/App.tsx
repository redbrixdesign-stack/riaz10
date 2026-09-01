import { Banner } from './components/Banner';
import { Hero } from './components/Hero';
import { Problem } from './components/Problem';
import { Solution } from './components/Solution';
import { HowItWorks } from './components/HowItWorks';
import { BuiltForOne } from './components/BuiltForOne';
import { Founder } from './components/Founder';
import { Trust } from './components/Trust';
import { Faq } from './components/Faq';
import { Pilot } from './components/Pilot';
import { Partner } from './components/Partner';
import { Privacy } from './components/Privacy';
import { Footer } from './components/Footer';
import { Header } from './components/Header';

export default function App() {
  return (
    <>
      <Banner />
      <Header />
      <main>
        <Hero />
        <Problem />
        <Solution />
        <HowItWorks />
        <BuiltForOne />
        <Founder />
        <Trust />
        <Faq />
        <Privacy />
        <Pilot />
        <Partner />
      </main>
      <Footer />
    </>
  );
}
