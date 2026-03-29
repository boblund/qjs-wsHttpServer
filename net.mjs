import * as os from 'os';
import { Client, Server } from 'socket.so';

export function createServer( createServerCb ){
	const server = new Server;
	return {
		listen( port ){
			const READBUF_CHUNK_SIZE = 4096;
			const fdBuff = new Uint8Array( 4 );
			const { stop, pipe_fd } = server.listen( port );
			os.setReadHandler( pipe_fd, () => {
				if( os.read( pipe_fd, fdBuff.buffer, 0, fdBuff.length ) > 0 ){
					const socket = new class{
						fd = undefined;
						listeners = {
							data: () => {},
							close: () => {},
							error: () => {}
						};
						end(){ server.end( socket.fd ); }
						on( event, func ){
							this.listeners[ event ] = func;
							return func;
						};
						write( aBuf ){ os.write( this.fd, aBuf, 0, aBuf.byteLength ); }
					};

					socket.fd = new DataView( fdBuff.buffer ).getInt32( 0, true );
					console.log( `server client on fd: ${ socket.fd }` );
					createServerCb( socket );
					os.setReadHandler( socket.fd, () => {
						const readBuf = new Uint8Array( READBUF_CHUNK_SIZE );
						let n;
						if ( ( n = os.read( socket.fd, readBuf.buffer, 0, readBuf.length ) )  > 0 ) {
							socket.listeners.data( readBuf.slice( 0, n ) );
							readBuf.fill( 0 );
							return;
						}
						n === 0
							? socket.listeners.close()
							: socket.listeners.error( -n );
						os.close( socket.fd );
						os.setReadHandler( socket.fd, null );
						console.log( `closed server client on fd: ${ socket.fd }` );
					} );
				} else {
					os.close( pipe_fd );
					stop();
				}
			} );
		}
	};
}

export function createConnection( func = undefined ){
	const listeners = {
		data: new Set,
		close: new Set,
		connect: new Set,
		error: new Set
	};

	let fd, client;

	const socket = {
		connect( { port, ip }, func = undefined ){
			if( typeof func === 'function' ) listeners[ 'connect' ].add( func );
			const CHUNK_SIZE = 4096;
			client = new Client();
			fd = client.connect( { ip, port } );
			if( fd < 0 ){
				listeners.error.forEach( func => func( -fd ) );
				return undefined;
			}

			listeners.connect.forEach( func => func() );
			listeners.connect.clear();
			let readBuf = new Uint8Array( CHUNK_SIZE );
			os.setReadHandler( fd, () => {
				const n = os.read( fd, readBuf.buffer, 0, readBuf.length );
				if ( n > 0 ){
					listeners.data.forEach( func => func( readBuf ) );
					return;
				}
				n === 0
					? listeners.close.forEach( func => func() )
					: listeners.error.forEach( func => func( -n ) );
				os.close( fd );
				os.setReadHandler( fd, null );
				client = undefined;
			} );
		},

		end( aBuf = undefined ){
			if( aBuf ) os.write( fd, aBuf, 0, aBuf.byteLength );
			client.end();
		},

		destroy(){
			client = undefined;
			os.close( fd );
			os.setReadHandler( fd, null );
		},

		on( event, func ){ listeners[ event ].add( func ); },
		removeEventListener( event, func ){ listeners[ event ].delete( func ); },
		write( aBuf ){ os.write( fd, aBuf, 0, aBuf.byteLength ); }
	};

	if( typeof func === 'function' ) listeners[ 'connect' ].add( func );
	return socket;
}