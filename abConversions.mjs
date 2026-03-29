export { toBase64, fromBase64, stringToAb };
//import { readFileSync, writeFileSync } from 'fs';

const b64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function stringToAb( str ) {
	const bytes = new Uint8Array( str.length );
	for ( let i = 0; i < str.length; i++ ) {
		bytes[i] = str.charCodeAt( i ) & 0xFF;
	}
	return bytes.buffer;
}

function toBase64( input ) {
	if( !( input instanceof Uint8Array || ( input instanceof String || typeof input === 'string' ) ) ){
		throw( 'error: input not Uint8Array or string' );
	}

	const uint8array = input instanceof Uint8Array
		? input
		: stringToAb( input );

	let bitBuffer = 0; // sliding window of uint8array bits to be converted to b64
	let bitCnt = 0;
	let output = '';

	for( let i = 0; i < uint8array.length; i++ ){
		bitBuffer = ( bitBuffer << 8 ) | uint8array[ i ];
		bitCnt += 8;
		while( bitCnt >= 6 ){
			output += b64Chars[ ( bitBuffer >> bitCnt - 6 ) & 0x3f ]; // 6 MSB are b64 bits
			//bitBuffer = bitBuffer & ( ( 2 ** ( bitCnt - 6 ) ) - 1 ); // remove 6 MSB - not necessary?
			bitCnt -= 6;
		}
	}

	if( bitCnt > 0 ) // pad remaining to 6 bits
		output += b64Chars[ bitBuffer << ( 6 - bitCnt ) ] + ( bitCnt == 4 ? '=' : '==' );

	return output;
}

function fromBase64( b64String ) {
	//const chars = b64String.replaceAll( '=', '' );
	let bitBuffer = 0;
	let bitCount = 0;
	const bytes = [];

	for ( let i = 0; i < b64String.length; i++ ) {
		const val = b64Chars.indexOf( b64String[i] );
		if ( val === -1 ) continue; // Skip invalid chars

		bitBuffer = ( bitBuffer << 6 ) | val;
		bitCount += 6;

		while ( bitCount >= 8 ) {
			bytes.push( ( bitBuffer >>> ( bitCount - 8 ) ) & 0xFF );
			bitCount -= 8;
			bitBuffer = bitBuffer & 0xFFF; // never more than 12 LSB bits that haven't been copied to bytes
		}
	}
	return Uint8Array.from( bytes );
}

/*
function test(){
	const s = 'Hello'; //[251,252,253,254,255];
	let b64String = toBase64( s );
	console.log( `toBase64( ${ s } ) => ${ b64String }` );
	let fromB64 = fromBase64( b64String );
	fromB64 = typeof s === 'string'
		? Array.from( fromB64, ( byte ) => String.fromCharCode( byte ) ).join( '' ) //fromB64.map( e => String.fromCharCode( e ) ).join( '' )
		: fromB64;
	console.log( `fromBase64( ${ b64String } ) => ${ fromB64 }` );


	let inFile = readFileSync( 'files/favicon.ico' );
	let b64 = toBase64( inFile );
	let outFile = fromBase64( b64 );
	writeFileSync( 'temp/favicon.ico', Buffer.from( outFile ) );
	try{
		console.log( toBase64( [ 1, 2, 3 ] ) );
	}catch( e ){
		console.log( 'toBase64( [ 1, 2, 3 ] )=>', e );
	}
}

test();
*/
