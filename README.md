# qjs-wsHttpServer

## Overview

qjs-wsHttpServer is a JavaScript ws/http server that supports TLS. It uses [qjs-socket](https://github.com/boblund/qjs-socket) for socket transport and can be compiled with qjsc into a standalone executable that includes HTML/JS/CSS static content.

wsHttpServer.mjs is an example of the server. It uses http.mjs that exports ```createServer``` used to create an http server that support https and provides an interface similar to [node:http](https://nodejs.org/api/http.html#class-httpserver). ws.mjs exports ```createServer``` used to create a websocket server that supports wss and provides an interface similar to [ws](https://www.npmjs.com/package/ws). The ws/s server must be used with the http/s server.

# API
## http.mjs
```
import * as http from 'http.mjs'
```
#### Constructor
const server = http.createServer( requestHandler )
- requestHandler( req, resp ): Function called on an http request
	- req: { method, path, protocol, headers } see [node:http](https://nodejs.org/api/http.html)
	-	resp: A Response object for responding to the request

- Returns: An http.Server instance

### http.Server
#### Methods
listen( { port [, key, cert ] } ) - Listen for client connect requests
- port: Server port
- key, cert: If both present, use tls, otherwise unencrypted
- Returns: Undefined

wsUpgrade( func ) - Function to process websocket upgrade. See ws.mjs for use.
- func( headers, socket )
	- headers: Upgrade request headers
	- socket: Request socket to use for response

### Response
#### Methods
end( [ aBuf ] ): Write the optional ArrayBuffer and end response

setHeader( key, value ): Set a response header or overwrite an existing one
- key: Header property name
- value: Header value

statusCode = code: Set response status code
- code: HTTP status code

statusMessage = message: Set response status message
- message: message string

write(aBuf): write the ArrayBuffer

### ws.Server
#### Constructor
const wss = ws.createServer( httpServer )
- httpServer: return value of http.createServer
- Returns: websocket server instance

#### Events
- connection: Emitted when websocket connects. Argument is a WebSocket instance.

#### Methods
wss.on(event, func) - registers a callback for event
- event: event name
- Returns: undefined

### WebSocket
### Constructor
Argument to WebsocketServer 'connection' event callback.

#### Events
- message: Emitted when a message is received. Argument is an ArrayBuffer.
- close: Emitted when the websocket is closed.

#### Methods
ws.on(event, func) - Registers a callback for event
- event: Event name
- Returns: Undefined

ws.send(data): Send data on the websocket.
- data: ArrayBuffer
- Returns: Undefined

## TLS Credentials
Using TLS requires a server private key and certificate named key.pem and cert.pem, respectively. A self-signed cert and key can be made using [mkcert](https://github.com/filosottile/mkcert). Use
```
mkcert --install
```
to create key and cert, add the certificate to your system's trust store.

# Using
qjs-socket was designed for and tested in QuickJS Compiler version 2025-09-13.

wsHttpServer.mjs is the server and file store for the static HTML/CSS/JavaScript files, which are expected to be in ./files. bundleFiles.mjs is run to take the contents of ./files and build a module httpPaths.mjs that exports an object that contains a property for each file in ./files, e.g.
```
{
  '/favicon.ico': {  //HTTP request path
    body, //contents of file (base64 encoded if image )
    type  //Content-Type
  },
  .
  .
  .
}
```
Nested directories are allowed. The sample contents of ./files is a trivial web page that loads a JavaScript file that uses websockets. The websocket assumes port 8080 so either run wsHttpServer using port 8080 or change files/index.mjs.

wsHttpServer uses the files socket.c and net.mjs from [qjs-socket](https://github.com/boblund/qjs-socket). These are downloaded if necessary when make is run.

To compile wsHttpServer do:
```
make wsHttpServer
```
The contents of ./files are dependencies for wsHttpServer so make should be run if any changes to ./files are made.

To run wsHttpServer do:
```
./wsHttpServer port tls
```
to listen on 'port'. Specify tls to make the server wss/https, omit it for ws/http.

# License

Software license: Creative Commons Attribution-NonCommercial 4.0 International

**THIS SOFTWARE COMES WITHOUT ANY WARRANTY, TO THE EXTENT PERMITTED BY APPLICABLE LAW.**
