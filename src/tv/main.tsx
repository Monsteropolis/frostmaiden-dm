import { render } from 'preact';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/spectral/400-italic.css';
import '../styles/tokens.css';
import '../styles/tv.css';
import { TvApp } from './app';

render(<TvApp />, document.getElementById('tv')!);
