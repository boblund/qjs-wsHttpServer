import * as std from 'std';
import { toBase64 } from './EncodeDecode.mjs';

function pipe( cmd ){
	const CHUNK_SIZE = 16 * 1024;
	let buf = new ArrayBuffer( CHUNK_SIZE );
	let fd = std.popen( cmd, 'r' );
	let n = 0, output = '';
	while( ( n = fd.read( buf, 0, CHUNK_SIZE ) ) > 0 ){
		output += String.fromCharCode.apply( null, new Uint8Array( buf, 0, n ) );
	};

	return output.split( '\n' ).filter( e => e != '' );
}

function readFile( name, mode = '' ) {
	let f = std.open( name, `r${ mode }` );

	if( mode == '' ){
		const s = f.readAsString();
		f.close();
		return s;
	}

	let totalLen = 0;
	const chunks = [];

	while ( true ) {
		let buf = new Uint8Array( 64 * 1024 );
		let len = f.read( buf.buffer, 0, buf.length );
		if ( len <= 0 ) break;
		chunks.push( buf.subarray( 0, len ) );
		totalLen += len;
	}
	f.close();
	let result = new Uint8Array( totalLen );
	let offset = 0;
	for ( let chunk of chunks ) {
		result.set( chunk, offset );
		offset += chunk.length;
	}
	return result;
}

const paths = {};
for( let file of pipe( 'find files -type f' ) ){
	const httpPath = file.replace( 'files', '' );
	const ext = file.split( '.' ).pop();
	const types = {
		ico: 'image/ico',
		png: 'image/png',
		html: 'text/html;charset=utf-8',
		js: 'text/javascript',
		mjs: 'text/javascript'
	};

	paths[ httpPath ] = {
		body: types[ ext ].includes( 'image' ) ? toBase64( readFile( file, 'b' ) ) : readFile( file ),
		type: types[ ext]
	};
}

let f = std.open( './httpPaths.mjs', 'w' );
f.puts( `
	// DO NOT EDIT. body (base64 encoded for image) and content-type for ${ Object.keys( paths ) }
	export { paths };
	const paths = ${ JSON.stringify( paths, null, 2 ) };
` );
f.close();
