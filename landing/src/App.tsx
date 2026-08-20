import { Banner } from './components/Banner';
import { Hero } from './components/Hero';
import { Problem } from './components/Problem';
import { Solution } from './components/Solution';
import { HowItWorks } from './components/HowItWorks';
import { BuiltForOne } from './components/BuiltForOne';
import { Founder } from './components/Founder';
import { Trust } from './components/Trust';
import { Pilot } from './components/Pilot';
import { Partner } from './components/Partner';
import { Footer } from './components/Footer';

export default function App() {
  return (
    <>
      <Banner />
      <main>
        <Hero />
        <Problem />
        <Solution />
        <HowItWorks />
        <BuiltForOne />
        <Founder />
        <Trust />
        <Pilot />
        <Partner />
      </main>
      <Footer />
    </>
  );
}
