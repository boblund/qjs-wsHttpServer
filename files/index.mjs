const socket = new WebSocket( `${ window.location.protocol == 'http:' ? 'ws' : 'wss' }://${ window.location.host }` );
socket.addEventListener( 'open', () => {
	socket.send( 'hello' );
} );

socket.addEventListener( 'message', event => {
	alert( `websocket message: ${ event.data }` );
	//socket.close( 1000, 'Going away' );
} );

socket.addEventListener( 'close', e => {
	alert( `websocket closed code: ${ e.code }, reason: ${ e.reason }` );
} );

document.querySelector( 'button' ).addEventListener( 'click', () => {
	alert( 'did something' );
} );
