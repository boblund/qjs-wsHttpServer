import * as net from 'net.mjs';
import { stringToAb } from 'abConversions.mjs';

function aBufToString(buffer) {
	return String.fromCharCode.apply(null, new Uint16Array(buffer));
}

function parseRequest( data ) {
	const str = data.toString();
	const lines = str.split( '\r\n' );
	const [ method, path, protocol ] = lines[0].split( ' ' );
	const headers = {};
	lines.slice( 1 ).forEach( line => {
		const [ key, ...value ] = line.split( ': ' );
		headers[key.toLowerCase()] = value.join( ': ' );
	} );

	return { method, path, protocol, headers };
}

class Response{
	#socket;
	#headers = [];
	#chunked = false;

	constructor( socket ){ this.#socket = socket; }
	end( aBuf = undefined ){
		if( aBuf ){ this.write( aBuf ); }
		if( this.#chunked ){
			this.#socket.write( stringToAb( '0\r\n\r\n' ) );
		}else{
			//this.#socket.end();
		}
	}

	setHeader( key, value ){
		this.#chunked = key == 'Transfer-Encoding';
		this.#headers.push( `${ key }: ${ value }` );
	}

	write( aBuf ){
		if( this.#headers.length > 0 ){
			this.#headers.unshift( `HTTP/1.1 ${ this.statusCode } ${ this.statusMessage }` );
			this.#socket.write( stringToAb( this.#headers.join( '\r\n' ) + '\r\n\r\n' ) );
			this.#headers = [];
		}

		if( this.#chunked ){
			this.#socket.write( stringToAb( `${ aBuf.byteLength.toString( 16 ) }\r\n` ) );
			this.#socket.write( aBuf );
			this.#socket.write( stringToAb( '\r\n' ) );
		}else{
			this.#socket.write( aBuf );
		}
	}
}

export function createServer( func ){
	let wsUpgradeCb = undefined;
	let _socket;
	let netSocket = net.createServer( ( socket ) => {
		_socket = socket;
		socket.on( 'data', readBuf => {
			const req = parseRequest( String.fromCharCode( ...new Uint8Array( readBuf.buffer, 0, readBuf.buffer.length ) ) );
			if( req.headers?.[ "upgrade" ] == "websocket" ){
				console.log( `http server websocket upgrade` );
				if( wsUpgradeCb ){
					wsUpgradeCb( req.headers, socket );
				}else{
					console.log( `no websocket upgrade callback` );
				}
				return;
			}
			func( req, new Response( socket ) );
		} );

		socket.on( 'close', () => {
			console.log( `client disconnected` );
		} );

		socket.on( 'error', n => {
			console.log( n == 54 ? `client (fd ${ socket.fd }) closed` : `server error: ${ n }` );
		} );

		return socket;
	} );

	return new class{
		listen( port ){ netSocket.listen( port ); }
		wsUpgrade( func ){ wsUpgradeCb = func; }
	};
}
