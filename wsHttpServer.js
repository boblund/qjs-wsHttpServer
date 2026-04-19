import * as os from 'os';
import * as std from 'std';
import * as http from 'http.mjs';
import * as ws from 'ws.mjs';
import { paths } from 'httpPaths.mjs';
import { fromBase64, stringToUint8 } from 'abConversions.mjs';

const key = 'key.pem';
const cert = 'cert.pem';

os.signal( os.SIGINT, () => {
	console.log( 'server stopped' );
	std.exit( 0 );
} );

if( scriptArgs.length < 2 ){
	console.log( `Usage: ${ scriptArgs[ 0 ] } port [ tls ]` );
	std.exit( 1 );
}
const [ port, tls ] = scriptArgs.slice( 1 );

// Entries in paths of type image have a base64 encoded body
// convert back to Uint8Array
Object.keys( paths ).forEach( path => {
	if( paths[ path ].type.includes( 'image' ) ){
		paths[ path ].body = fromBase64( paths[ path ].body );
	}
} );

const pathNames = Object.keys( paths );
const CHUNKSIZE = 128 * 1024;
const MAX_BODY_LENGTH = 200 * 1000; // chromium limit for JS

const server = http.createServer( ( req, resp ) => {
	const path = req.path === '/' ? '/index.html' : pathNames.includes( req.path ) ? req.path : '';
	console.log( 'http server request:', path );
	if( path !== '' ){
		resp.statusCode = 200;
		resp.statusMessage = 'OK';
		resp.setHeader( 'Content-Type', paths[ path ].type );
		resp.setHeader( 'Connection', 'keep-alive' );

		const body = paths[ path ].body;
		const bodyLength = body instanceof Uint8Array ? body.byteLength : body.length;

		if( bodyLength <= MAX_BODY_LENGTH ){
			resp.setHeader( 'Content-Length', bodyLength );
			resp.write( body instanceof ArrayBuffer || body instanceof Uint8Array
				? body.buffer
				: stringToUint8( body ).buffer
			);
		} else {
			resp.setHeader( 'Transfer-Encoding', 'chunked' );
			for( let pos = 0; pos < bodyLength; ) {
				const chunkLen = ( pos + CHUNKSIZE < bodyLength ) ? CHUNKSIZE : ( bodyLength - pos );
				const chunk = body instanceof ArrayBuffer || body instanceof Uint8Array
					? body.slice( pos, pos + chunkLen ).buffer
					: stringToUint8( body.slice( pos, pos + chunkLen ) ).buffer;

				resp.write( chunk );
				pos += chunkLen;
			}
		}
		resp.end();

	} else {
		console.log( `http server bad path:${ req.path }` );
		resp.statusCode = 404;
		resp.statusMessage = 'NOT FOUND';
		resp.setHeader( 'Content-Type', 'text/html;charset=utf-8' );
		resp.setHeader( 'Connection', 'keep-alive' );
		resp.setHeader( 'Transfer-Encoding', 'chunked' );
		resp.end( stringToUint8( `404 ${ req.path } not found` ) ).buffer;
	}
} );

const wss = ws.createServer( { server } );
wss.on( 'connection', ws => {
	ws.on( 'message', data => { ws.send( data ); } );
	ws.on( 'close', () => { console.log( `websocket closing` ); } );
} );

server.listen( tls ? { port, key, cert } : { port } );
console.log( `${ tls ? 'TLS ' : '' }Socket server started on port: ${ port }` );
