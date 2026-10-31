import { render } from 'preact';
import { GrammarPage } from './GrammarPage';
import '../index.css';

// The page's language comes from its address (data-page-lang on <html>), not the browser's: see i18n.ts.
render(<GrammarPage />, document.getElementById('app')!);
