import * as net from 'net.mjs';
import { stringToUint8 } from 'abConversions.mjs';

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
			this.#socket.write( stringToUint8( '0\r\n\r\n' ).buffer );
		}else{
			//this.#socket.end();
		}
	}

	setHeader( key, value ){
		this.#chunked = key == 'Transfer-Encoding';
		let index = this.#headers.findIndex( e => e.includes( `key:` ) );
		if( index == -1 ){
			this.#headers.push( `${ key }: ${ value }` );
		}else{
			this.#headers[ index ] = `${ key }: ${ value }`;
		}
	}

	write( aBuf ){
		if( this.#headers.length > 0 ){
			this.#headers.unshift( `HTTP/1.1 ${ this.statusCode } ${ this.statusMessage }` );
			this.#socket.write( stringToUint8( this.#headers.join( '\r\n' ) + '\r\n\r\n' ).buffer );
			this.#headers = [];
		}

		if( this.#chunked ){
			this.#socket.write( stringToUint8( `${ aBuf.byteLength.toString( 16 ) }\r\n` ).buffer );
			this.#socket.write( aBuf );
			this.#socket.write( stringToUint8( '\r\n' ).buffer );
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
			if( req.protocol != "HTTP/1.1" ){
				console.log( 'Unknown request protocol' );
				socket.end();
				return;
			}
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
		listen( { port, key, cert } ){ netSocket.listen( { port, key, cert } ); }
		wsUpgrade( func ){ wsUpgradeCb = func; }
	};
}
