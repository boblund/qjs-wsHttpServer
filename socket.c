#include "quickjs.h"
#include <arpa/inet.h>
#include <netinet/in.h>
#include <stdatomic.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <unistd.h>
#include <poll.h>
#include <fcntl.h>
#include <errno.h>
#include <stdbool.h>

#define countof(x) (sizeof(x) / sizeof((x)[0]))

#ifdef JS_SHARED_LIBRARY
#define JS_INIT_MODULE js_init_module
#else
#define JS_INIT_MODULE js_init_module_socket
#endif

/* Client */

typedef struct {
		int socket_fd;
		JSContext *ctx;
} JSClientData;

static JSClassID js_client_class_id;

static void js_client_finalizer(JSRuntime *rt, JSValue val)
{
    JSClientData *s = JS_GetOpaque(val, js_client_class_id);
		//printf("FINALIZER called for %p\n", s);
    if (s == NULL ) return;
		if (s->socket_fd >= 0) {
			close(s->socket_fd);
			s->socket_fd = -1;
		}
		js_free_rt(rt, s);
}

static JSValue js_client_ctor(JSContext *ctx,
                             JSValueConst new_target,
                             int argc, JSValueConst *argv)
{
    JSClientData *s;
    JSValue obj = JS_UNDEFINED;
    JSValue proto;

    s = js_mallocz(ctx, sizeof(JSClientData));
    if (!s)
        return JS_EXCEPTION;

    /* using new_target to get the prototype is necessary when the
       class is extended. */

		s->ctx = ctx;
    proto = JS_GetPropertyStr(ctx, new_target, "prototype");
    if (JS_IsException(proto))
        goto fail;
    obj = JS_NewObjectProtoClass(ctx, proto, js_client_class_id);
    JS_FreeValue(ctx, proto);
    if (JS_IsException(obj))
        goto fail;
    JS_SetOpaque(obj, s);
    return obj;
 fail:
    js_free(ctx, s);
    JS_FreeValue(ctx, obj);
    return JS_EXCEPTION;
}

static JSValue js_client_get_fd(JSContext *ctx, JSValueConst this_val, int magic) {
    JSClientData *s = JS_GetOpaque2(ctx, this_val, js_client_class_id);
    if (!s) return JS_EXCEPTION;
    return JS_NewInt32(ctx, s->socket_fd );
}

static JSValue js_client_end(JSContext *ctx, JSValueConst this_val,int argc, JSValueConst *argv){
		JSClientData *s = JS_GetOpaque2(ctx, this_val, js_client_class_id);
    if (!s) return JS_EXCEPTION;
		shutdown(s->socket_fd, SHUT_WR);
		return JS_UNDEFINED;
}

static JSValue js_client_connect(JSContext *ctx, JSValueConst this_val,
                             int argc, JSValueConst *argv)
{
    JSClientData *s = JS_GetOpaque2(ctx, this_val, js_client_class_id);
    if (!s) return JS_EXCEPTION;

    if (argc != 1 || JS_VALUE_GET_TAG(argv[0]) != JS_TAG_OBJECT) {
        return JS_EXCEPTION;
    }

		int port;
    // Extract 'ip' as string
    JSValue js_ip = JS_GetPropertyStr(ctx, argv[0], "ip");
		const char* c_ip;
		if( JS_VALUE_GET_TAG( js_ip ) == JS_TAG_UNDEFINED ){
			c_ip = "127.0.0.1";
		} else {
			c_ip = JS_ToCString( ctx, js_ip );
			JS_FreeValue( ctx, js_ip );
		}

    // Extract 'port' as number
    JSValue js_port = JS_GetPropertyStr(ctx, argv[0], "port");
		if( JS_VALUE_GET_TAG( js_port ) == JS_TAG_UNDEFINED ){
			perror( "connect: { port } required" );
		} else {
			JS_ToInt32( ctx, &port, js_port );
			JS_FreeValue( ctx, js_port );
		}

    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) { perror("socket"); exit(EXIT_FAILURE); }
		s->socket_fd = sock;

    struct sockaddr_in server_addr;
    memset(&server_addr, 0, sizeof(server_addr));
    server_addr.sin_family = AF_INET;
    server_addr.sin_port = htons(port);
    if (inet_pton(AF_INET, c_ip, &server_addr.sin_addr) <= 0) {
        perror("inet_pton"); close(sock); exit(EXIT_FAILURE);
    }
		JS_FreeCString( ctx, c_ip );

    if (connect(sock, (struct sockaddr *)&server_addr, sizeof(server_addr)) < 0) {
        perror("connect"); close(sock); exit(EXIT_FAILURE);
    }
    return JS_NewInt32( ctx, sock );
}


static JSClassDef js_client_class = {
    "Client",
    .finalizer = js_client_finalizer,
};

static const JSCFunctionListEntry js_client_proto_funcs[] = {
    JS_CFUNC_DEF("connect", 0, js_client_connect),
		JS_CFUNC_DEF("end", 0, js_client_end),
		JS_CGETSET_MAGIC_DEF("fd", js_client_get_fd, NULL, 0),
};

/* Server */

#define MAX_CLIENTS 10

typedef struct {
		int socket_fd;
		JSContext *ctx;
} JSServerData;

static JSClassID js_server_class_id;

static void js_server_finalizer(JSRuntime *rt, JSValue val)
{
    JSServerData *s = JS_GetOpaque(val, js_server_class_id);
		//printf("FINALIZER called for %p\n", s);
    if (s == NULL ) return;
		if (s->socket_fd >= 0) {
			close(s->socket_fd);
			s->socket_fd = -1;
		}

		s->ctx = NULL;
		js_free_rt(rt, s);
}

static JSValue js_server_ctor(JSContext *ctx,
                             JSValueConst new_target,
                             int argc, JSValueConst *argv)
{
    JSServerData *s;
    JSValue obj = JS_UNDEFINED;
    JSValue proto;

    s = js_mallocz(ctx, sizeof(JSServerData));
    if (!s) return JS_EXCEPTION;
		s->ctx = ctx;

		proto = JS_GetPropertyStr(ctx, new_target, "prototype");
    if (JS_IsException(proto)) goto fail;

    obj = JS_NewObjectProtoClass(ctx, proto, js_server_class_id);
    JS_FreeValue(ctx, proto);
    if (JS_IsException(obj)) goto fail;
    JS_SetOpaque(obj, s);

    return obj;
 fail:
    js_free(ctx, s);
    JS_FreeValue(ctx, obj);
    return JS_EXCEPTION;
}

static JSValue js_server_end(JSContext *ctx, JSValueConst this_val,int argc, JSValueConst *argv){
		int fd;
		JS_ToInt32(ctx, &fd, argv[0]);
		JSServerData *s = JS_GetOpaque2(ctx, this_val, js_server_class_id);
    if (!s){
			printf("ERROR: server opaque NULL\n");
			return JS_EXCEPTION;
		}
		shutdown(fd, SHUT_WR);
		return JS_UNDEFINED;
}

static JSValue js_server_get_fd(JSContext *ctx, JSValueConst this_val, int magic) {
    JSServerData *s = JS_GetOpaque2(ctx, this_val, js_server_class_id);
    if (!s) return JS_EXCEPTION;
    return JS_NewInt32(ctx, s->socket_fd );
}

typedef struct{
    int listen_fd;
		int pipe_w_fd;
} thread_data_t;

static atomic_bool global_stop_flag = false;

void* accept_thread_func( void* arg ){
		thread_data_t* thread_data_ptr = (thread_data_t*)arg;
		int listen_fd = thread_data_ptr->listen_fd;
		int pipe_w_fd = thread_data_ptr->pipe_w_fd;
		free( arg );
		int flags = fcntl(listen_fd, F_GETFL, 0);
    if (flags == -1) {
        printf("ERROR: listen_fd %d is invalid\n", listen_fd);
        return NULL;
    }

		while( !atomic_load(&global_stop_flag) ){
			int client_fd = accept(listen_fd, NULL, NULL);
			int bytes = write( pipe_w_fd, &client_fd, sizeof(int) );
			if(bytes == -1 && errno == EPIPE) {
					printf("accept_thread_func EPIPE error on fd %d.\n", pipe_w_fd );
					close( pipe_w_fd );
					return NULL;
			}
		}
		printf( "attach_thread stopped\n" );
		return NULL;
}

static pthread_t global_accept_thread;
static int pipefds[ 2 ];

JSValue js_stop_listen(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
		printf( "attach_thread stopping\n" );
    atomic_store(&global_stop_flag, true);
    return JS_UNDEFINED;
}

static JSValue js_server_listen(JSContext *ctx, JSValueConst this_val,
                             int argc, JSValueConst *argv)
{
    JSServerData *s = JS_GetOpaque2(ctx, this_val, js_server_class_id);
    if (!s) return JS_EXCEPTION;
		int port;
		JS_ToInt32(ctx, &port, argv[0]);
		int listen_fd = socket(AF_INET, SOCK_STREAM, 0);
		if (listen_fd < 0) { perror("socket"); exit(EXIT_FAILURE); }

		struct sockaddr_in addr;
		memset(&addr, 0, sizeof(addr));
		addr.sin_family = AF_INET;
		addr.sin_addr.s_addr = INADDR_ANY;
		addr.sin_port = htons(port);

		int opt = 1;
		setsockopt(listen_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
		if (bind(listen_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
				perror("bind");
				close(listen_fd);
				return JS_NewInt32( ctx, -1 );
		}
    int flags = fcntl(listen_fd, F_GETFL, 0);
    if (flags == -1) {
        printf("ERROR: listen_fd %d is invalid\n", listen_fd);
        return JS_NewInt32( ctx, -1 );
    }
		if (listen(listen_fd, MAX_CLIENTS) < 0) {
				perror("listen"); close(listen_fd); exit(EXIT_FAILURE);
				return JS_UNDEFINED;
		}

		pipe(pipefds);

		thread_data_t* thread_data_ptr = malloc( sizeof( thread_data_t ) );
		thread_data_ptr->listen_fd = listen_fd;
		thread_data_ptr->pipe_w_fd = pipefds[ 1 ];

		atomic_store(&global_stop_flag, false);

    pthread_attr_t attr;
    pthread_attr_init(&attr);
    pthread_attr_setdetachstate(&attr, PTHREAD_CREATE_DETACHED);
    pthread_create(&global_accept_thread, &attr, accept_thread_func, (void*)thread_data_ptr );
    pthread_attr_destroy(&attr);

		JSValue obj = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, obj, "pipe_fd", JS_NewInt32(ctx, pipefds[ 0 ] ) );
    JS_SetPropertyStr(ctx, obj, "stop", JS_NewCFunction(ctx, js_stop_listen, "stop", 0));
    return obj;
}

static JSClassDef js_server_class = {
    "Server",
    .finalizer = js_server_finalizer,
};

static const JSCFunctionListEntry js_server_proto_funcs[] = {
    JS_CFUNC_DEF("listen", 0, js_server_listen),
		JS_CFUNC_DEF("end", 0, js_server_end),
		JS_CGETSET_MAGIC_DEF("fd", js_server_get_fd, NULL, 0),
};

static int js_socket_init(JSContext *ctx, JSModuleDef *m)
{
		/* create the Client class */

    JSValue client_proto, client_class;

    /* create the Client class */
    JS_NewClassID(&js_client_class_id);
    JS_NewClass(JS_GetRuntime(ctx), js_client_class_id, &js_client_class);
    client_proto = JS_NewObject(ctx);
    JS_SetPropertyFunctionList(ctx, client_proto, js_client_proto_funcs, countof(js_client_proto_funcs));
    client_class = JS_NewCFunction2(ctx, js_client_ctor, "Client", 2, JS_CFUNC_constructor, 0);
    JS_SetConstructor(ctx, client_class, client_proto);
    JS_SetClassProto(ctx, js_client_class_id, client_proto);

    JS_SetModuleExport(ctx, m, "Client", client_class);

    /* create the Server class */
		JSValue server_proto, server_class;
    JS_NewClassID(&js_server_class_id);
    JS_NewClass(JS_GetRuntime(ctx), js_server_class_id, &js_server_class);
    server_proto = JS_NewObject(ctx);
    JS_SetPropertyFunctionList(ctx, server_proto, js_server_proto_funcs, countof(js_server_proto_funcs));
    server_class = JS_NewCFunction2(ctx, js_server_ctor, "Server", 2, JS_CFUNC_constructor, 0);
    JS_SetConstructor(ctx, server_class, server_proto);
    JS_SetClassProto(ctx, js_server_class_id, server_proto);

    JS_SetModuleExport(ctx, m, "Server", server_class);
    return 0;
}

JSModuleDef *JS_INIT_MODULE(JSContext *ctx, const char *module_name)
{
    JSModuleDef *m;
    m = JS_NewCModule(ctx, module_name, js_socket_init);
    if (!m)
        return NULL;
    JS_AddModuleExport(ctx, m, "Client");
		JS_AddModuleExport(ctx, m, "Server");
    return m;
}