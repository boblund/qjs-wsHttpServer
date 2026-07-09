import * as os from 'os';
import { b64_sha1 } from 'sha1.mjs';
import { TextEncoder } from './EncodeDecode.mjs';

const enc = new TextEncoder;
const MAX_PAYLOAD = 1024 * 1000;

function concatUint8( a, b ){
	const r = new Uint8Array( a.length + b.length );
	r.set( a, 0 );
	r.set( b, a.length );
	return r;
}

function uint8ArrayToString( uint8Array ) {
	return Array.from( uint8Array, byte => String.fromCharCode( byte ) ).join( '' );
}

function wsFrame( opcode, data ) {
	const fin    = 0x80; // FIN bit set
	const payloadLen = data.length;

	// Header length: 2 base + 2 or 8 for extended length
	let headerLen = 2;
	if ( payloadLen >= 126 ) {
		headerLen += payloadLen <= 65535 ? 2 : 8;
	}

	const raw = new Uint8Array( headerLen + payloadLen );
	let offset = 0;

	// Byte 0: FIN + opcode
	raw[offset++] = fin | opcode;

	// Byte 1: length (no mask)
	if ( payloadLen <= 125 ) {
		raw[offset++] = payloadLen;
	} else if ( payloadLen <= 65535 ) {
		raw[offset++] = 126;
		raw[offset++] = ( payloadLen >>> 8 ) & 0xFF;
		raw[offset++] = payloadLen & 0xFF;
	} else {
		raw[offset++] = 127;
		// upper 32 bits zero
		for ( let i = 0; i < 4; i++ ) raw[offset++] = 0;
		// lower 32‑bit length
		for ( let i = 0; i < 4; i++ ) raw[offset++] = ( payloadLen >>> ( 24 - 8 * i ) ) & 0xFF;
	}

	// Copy payload
	raw.set( data, offset );

	return raw.buffer;
}

function serverError( fds, closeFn, e ){
	const maxReasonBytes = 123;
	const reasonBytes = e.msg.length > maxReasonBytes
		? e.msg.slice( 0, maxReasonBytes )
		:	e.msg;

	const payload = new Uint8Array( 2 + reasonBytes.length );
	payload[0] = ( e.code >> 8 ) & 0xFF;
	payload[1] = e.code & 0xFF;
	payload.set( reasonBytes, 2 );
	const frame = wsFrame( 0x8, payload );
	os.write( fds[ 1 ], frame, 0, frame.byteLength );
	closeFn();
	os.setReadHandler( fds[ 0 ], null );
	os.close( fds[ 0 ] ); os.close( fds[ 1 ] );
	fds[ 0 ] = fds[ 1 ] = -1;
}

const magicGUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
class Websocket{
	#listeners = {
		message: undefined,
		close: undefined
	};
	#fds;

	constructor( fds ){
		this.#fds = fds;

		let buf = new Uint8Array( 0 );
		const readBuf = new Uint8Array( 4096 );
		os.setReadHandler( fds[ 0 ], () => {
			const n = os.read( fds[ 0 ], readBuf.buffer, 0, readBuf.length );
			if( n > 0 ){
				buf = concatUint8( buf, readBuf.slice( 0, n ) );
				while( true ){ // buf may contain more than one ws frame
					if ( buf.length < 2 ) return;

					const opcode     = buf[0] & 0x0F;                 // bottom 4 bits
					const masked     = Boolean( buf[1] & 0x80 );        // bit 7
					let   payloadLen = buf[1] & 0x7F;                 // bottom 7 bits

					let offset = 2;

					// Extended payload length
					if ( payloadLen === 126 ) {
						if ( buf.length < offset + 2 ) return;
						payloadLen = ( buf[offset] << 8 ) | buf[offset + 1];
						offset += 2;
					} else if ( payloadLen === 127 ) {
						if ( buf.length < offset + 8 ) return;
						// top 4 bytes should be 0 for realistic sizes; if not, payload is >4GB (reject/handle separately)
						const high = ( buf[offset] << 24 ) | ( buf[offset + 1] << 16 ) | ( buf[offset + 2] << 8 ) | buf[offset + 3];
						if ( high !== 0 ){
							serverError( fds, this.#listeners.close, { code: 1002, msg: 'Payload too large' } );
							return;
						}
						payloadLen = (
							( buf[offset + 4] << 24 ) |
							( buf[offset + 5] << 16 ) |
							( buf[offset + 6] << 8 ) |
							buf[offset + 7]
						) >>> 0;

						offset += 8;
					}

					let maskingKey = null;
					if ( masked ) {
						if ( buf.length < offset + 4 ) return;
						maskingKey = buf.slice( offset, offset + 4 );
						offset += 4;
					}

					if( payloadLen > MAX_PAYLOAD ){
						serverError( fds, this.#listeners.close, { code: 1002, msg: 'Payload too large' } );
						return;
					}

					if ( buf.length < offset + payloadLen ) return;
					let payload = buf.slice( offset, offset + payloadLen );

					// If client‑to‑server, payload is masked
					if ( masked )  payload = payload.map( ( byte, i ) => byte ^ maskingKey[i % 4] );

					this.#listeners.message( opcode == 1 ? uint8ArrayToString( payload ) : payload );
					buf =  buf.slice( offset + payloadLen ); // working buf is now whatever wasn't part of sent frame
				}
			} else {
				if( n < 0 ) console.log( 'ws.mjs os.read error:', -n );
				this.#listeners.close();
				os.setReadHandler( fds[ 0 ], null );
				os.close( fds[ 0 ] ); os.close( fds[ 1 ] );
				fds[ 0 ] = fds[ 1 ] = -1;
			}
		} );
	}

	on( event, func ){ this.#listeners[ event ] = func; }
	send( data ){
		let opcode, payload;
		switch( true ){
			case typeof data == 'string' || data instanceof String:
				opcode = 1;
				payload = enc.encode( data );
				break;

			case data instanceof Uint8Array:
				opcode = 2;
				payload = data;
				break;

			case data instanceof ArrayBuffer:
				opcode = 2;
				payload = new Uint8Array( data );
				break;

			default:
				throw( `ws.send: data must be string | String | Uint8Array | ArrayBuffer` );
		}

		const frame = wsFrame( opcode, payload );
		os.write( this.#fds[ 1 ], frame, 0, frame.byteLength );
	}
}

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
			this.#listeners.connection( new Websocket( [ ...fds ] ) );
		} );
	}

	on( event, func ){
		if( event == 'connection' ){ this.#listeners.connection = func; }
	}
};

export function createServer( server ){ return new WebsocketServer( server ); }
