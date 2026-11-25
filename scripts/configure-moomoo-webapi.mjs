// Compatibility entry point: use browser PKCE instead of pasting persistent tokens.
import {runMoomooWebApiConnector} from './connect-moomoo-webapi.mjs';
await runMoomooWebApiConnector();
