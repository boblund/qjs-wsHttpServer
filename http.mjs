import * as os from 'os';
import * as std from 'std';
import { Server } from 'socket.so';
import { TextEncoder } from './EncodeDecode.mjs';

const enc = new TextEncoder;

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

function writeStr( fd, str ){
	const buf = enc.encode( str );
	os.write( fd, buf.buffer, 0, buf.length );
}

class Response{
	#fd;
	#headers = [];
	#chunked = false;

	constructor( fd ){ this.#fd = fd; }
	end( aBuf = undefined ){
		if( aBuf ){ os.write( this.#fd, aBuf, 0, aBuf.byteLength ); }
		if( this.#chunked ){
			writeStr( this.#fd, '0\r\n\r\n' );
		}else{
			//close this.#fd?
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
			writeStr( this.#fd, this.#headers.join( '\r\n' ) + '\r\n\r\n' );
			this.#headers = [];
		}

		if( this.#chunked ){
			writeStr( this.#fd, `${ aBuf.byteLength.toString( 16 ) }\r\n` );
			os.write( this.#fd, aBuf, 0, aBuf.byteLength );
			writeStr( this.#fd, '\r\n' );
		}else{
			os.write( this.#fd, aBuf, 0, aBuf.byteLength );
		}
	}
}

export function createServer( httpServerCb ){
	const server = new Server();
	let wsUpgradeCb = undefined;

	function listen( { port, key, cert } ){
		const READBUF_CHUNK_SIZE = 4096;
		const fdBuff = new Int32Array( 2 ); //( https ? 2 : 1 );
		const { stop, pipe_fd } = server.listen( { port, key, cert } );

		os.setReadHandler( pipe_fd, () => {
			if( os.read( pipe_fd, fdBuff.buffer, 0, fdBuff.length * 4 ) > 0 ){
				const fds = Array.from( fdBuff );
				/*const socket = new class{
					read_fd = fds[ 0 ];
					write_fd = fds[ 1 ];
					listeners = {
						data: () => {},
						close: () => {},
						error: () => {}
					};
					end(){ server.end( socket.read_fd ); }
					on( event, func ){
						this.listeners[ event ] = func;
						return func;
					};
					write( aBuf ){ os.write( this.write_fd, aBuf, 0, aBuf.byteLength ); }
				};*/

				os.setReadHandler( fds[ 0 ], () => {
					let readBuf = new Uint8Array( READBUF_CHUNK_SIZE );
					let n;
					if ( ( n = os.read( fds[ 0 ], readBuf.buffer, 0, readBuf.length ) )  > 0 ) {
						readBuf = readBuf.slice( 0, n );
						const req = parseRequest( String.fromCharCode( ...new Uint8Array( readBuf.buffer, 0, readBuf.buffer.length ) ) );
						if( req.protocol != "HTTP/1.1" ){
							console.log( 'Unknown request protocol:', req.protocol, 'on fd:', fds[ 0 ] );
							//socket.end();
							server.end( fds[ 0 ] );
							return;
						}
						if( req.headers?.[ "upgrade" ] == "websocket" ){
							console.log( `http server websocket upgrade` );
							os.setReadHandler( fds[ 0 ], null );
							if( wsUpgradeCb ){
								wsUpgradeCb( req.headers, [ ...fds ] );
							}else{
								console.log( `no websocket upgrade callback` );
							}
							return;
						}
						httpServerCb( req, new Response( fds[ 1 ] ) );
						readBuf.fill( 0 );
						return;
					}
					if( n === 0 ){
						console.log( `client disconnected` );
					} else {
						console.log( n == 54 ? `client (fd ${ fds[ 0 ] }) closed` : `server error fds[ 0 ]: ${ fds[ 0 ] }, n: ${ n }` );
						std.exit( 1 );
					}
					os.setReadHandler( fds[ 0 ], null );
					os.close( fds[ 0 ] ); os.close( fds[ 1 ] );
					fds[ 0 ] = fds[ 1 ] = -1;
				} );
			} else {
				os.close( pipe_fd );
				stop();
			}
		} );
	}

	return {
		listen,
		wsUpgrade( func ){ wsUpgradeCb = func; }
	};
}
