import { render } from 'preact';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/spectral/400-italic.css';
import '@fontsource/silkscreen/400.css';
// Wave 7 (QA #1): a compact, high-legibility pixel font for the in-world name
// labels — Silkscreen was hard to read at ~8px even outlined.
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import '../styles/tokens.css';
import '../styles/tv.css';
import { TvApp } from './app';

render(<TvApp />, document.getElementById('tv')!);
