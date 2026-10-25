import { render } from 'preact';
import { App } from './app';
import './index.css';

// The static copy in index.html is for search engines and link previews; the app replaces it.
document.getElementById('seo')?.remove();
render(<App />, document.getElementById('app')!);
