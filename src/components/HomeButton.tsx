/** Jednotné kulaté tlačítko zpět s domečkem (design kbtn--round + i-home). Dítě nemusí číst „Zpět“. */
export default function HomeButton({ onClick, label = 'Zpět' }: { onClick: () => void; label?: string }) {
  return (
    <button className="kbtn kbtn--round home-btn" aria-label={label} data-testid="home-btn" onClick={onClick}>
      <svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /><path d="M6 10v9.5h4.5V15h3v4.5H18V10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" /></svg>
    </button>
  );
}
