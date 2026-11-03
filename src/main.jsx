import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Relay } from '@lucasmarkes/hairline/react';
import './style.css';

const disciplines = [
  { name: 'Engineering', position: 'northwest', number: '01', subtitle: 'Systems & tools', description: 'Connecting design and code.', detail: 'Design systems, design tokens, and automated workflows that keep design and development in sync.', tags: ['Design systems', 'Token sync', 'Design tooling'] },
  { name: 'Product', position: 'southeast', number: '02', subtitle: 'Interfaces & experiences', description: 'Making the complex feel simple.', detail: 'UI/UX case studies exploring how people move through products, from the first question to the final interaction.', tags: ['UI / UX', 'Interaction design', 'Case studies'] },
  { name: 'Motion', position: 'southwest', number: '03', subtitle: 'Rhythm & movement', description: 'Giving ideas a sense of time.', detail: 'Graphic animation and motion experiments made with GSAP and Lottie. An exploration of timing, rhythm, and expression.', tags: ['GSAP', 'Lottie', 'Graphic animation'] },
  { name: 'Fine Art', position: 'northeast', number: '04', subtitle: 'Form & material', description: 'Thinking through making.', detail: 'Sculpture and artistic explorations of form, material, and space. A place for work beyond the screen.', tags: ['Sculpture', 'Material studies', 'Art practice'] },
];

function Page() {
  const [selected, setSelected] = useState(disciplines[0]);
  const [playing, setPlaying] = useState(true);
  const dialog = useRef(null);
  function openDiscipline(item) {
    setSelected(item);
    dialog.current.showModal();
  }
  return (
    <main>
      <header className="masthead">
        <a className="wordmark" href="./" aria-label="Sam, home">sam<span>✳</span></a>
        <span className="masthead-note">Independent practice<br />Design, code & objects</span>
        <span className="portfolio-label"><i /> Portfolio / Index</span>
      </header>

      <section className="introduction" aria-label="Introduction">
        <h1>Different disciplines.<br /><span>Same curiosity.</span></h1>
        <p className="intro-note">Between the logic of systems<br />{' '}and the feeling of things.</p>
      </section>

      <section className="map" aria-label="Explore portfolio disciplines">
        <div className="relay-stage">
          <Relay className="relay" theme="light" intensity={0.55} play={playing} label="An interactive relay connecting four branches. Move your pointer across the tiles to light their paths." />
        {disciplines.map(item => (
          <button key={item.name} className={`discipline ${item.position}`} onClick={() => openDiscipline(item)} aria-haspopup="dialog">
            <span className="discipline-meta">{item.number} / {item.subtitle}</span>
            <span className="discipline-title">{item.name}<span className="arrow" aria-hidden="true">↗</span></span>
          </button>
        ))}
        </div>
      </section>

      <footer>
        <span className="footer-signature">Exploring the space between.</span>
        <span className="interaction-hint">Move across the relay · Select a discipline</span>
        <button className="play-toggle" onClick={() => setPlaying(!playing)} aria-pressed={playing}><span aria-hidden="true">{playing ? 'Ⅱ' : '▷'}</span> Autoplay {playing ? 'on' : 'off'}</button>
      </footer>

      <dialog ref={dialog} onClick={event => { if (event.target === dialog.current) dialog.current.close(); }} aria-labelledby="discipline-heading">
        <div className="dialog-inner">
          <div className="dialog-top"><span className="eyebrow">{selected.number} / {selected.subtitle}</span><button className="close" onClick={() => dialog.current.close()} aria-label="Close discipline">×</button></div>
          <h2 id="discipline-heading">{selected.name}<span>.</span></h2>
          <h3>{selected.description}</h3>
          <p className="dialog-description">{selected.detail}</p>
          <div className="tags">{selected.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
          <div className="empty-state"><span className="status-dot" /> Work will be added here.</div>
        </div>
      </dialog>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Page />);
