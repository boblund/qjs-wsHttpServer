const socket = new WebSocket( `${ window.location.protocol == 'http:' ? 'ws' : 'wss' }://localhost:8080` );
socket.addEventListener( 'open', () => {
	socket.send( 'hello' );
} );

socket.addEventListener( 'message', event => {
	alert( `websocket message: ${ event.data }` );
} );

document.querySelector( 'button' ).addEventListener( 'click', () => {
	alert( 'did something' );
} );
