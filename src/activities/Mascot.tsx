import { MASCOT } from './common';

export default function Mascot({ mood }: { mood: 'radost' | 'povzbuzeni' | 'premysli' }) {
  return <img className="mascot" src={MASCOT[mood]} alt="" data-testid="mascot" data-mood={mood} draggable={false} />;
}
