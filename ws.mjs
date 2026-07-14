import * as os from 'os';
import { b64_sha1 } from 'sha1.mjs';
import { WsEndpoint } from '../p2p-client/wsEndpoint.mjs';
import { TextEncoder } from './EncodeDecode.mjs';

const enc = new TextEncoder;
const magicGUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class WebsocketServer{
	#listeners = {
		connection: undefined
	};

	constructor( { server } ){
		server.wsUpgrade( ( headers, fds ) => {
			const buf = enc.encode( "HTTP/1.1 101 Switching Protocols\r\n" +
				"Upgrade: websocket\r\n" +
				"Connection: Upgrade\r\n" +
				`Sec-WebSocket-Accept: ${ b64_sha1( headers['sec-websocket-key'] + magicGUID ) }\r\n` +
				"\r\n" );
			os.write( fds[ 1 ], buf.buffer, 0, buf.length );
			this.#listeners.connection( new WsEndpoint( [ ...fds ], server, 'server' ) );
		} );
	}

	on( event, func ){
		if( event == 'connection' ){ this.#listeners.connection = func; }
	}
};

export function createServer( server ){ return new WebsocketServer( server ); }
