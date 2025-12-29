import EventEmitter from 'node:events';

export class Sockets extends EventEmitter {

    constructor () {
        super();
        this.sockets = new Set();
    }

    add (socket) {
        return this.sockets.add(socket);
    }

    clear () {
        return this.sockets.clear();
    }

    delete (socket) {
        this.sockets.delete(socket);
        if (!this.sockets.size) {
            this.emit('empty');
        }
    }

    entries () {
        return this.sockets.entries();
    }

    isEmpty () {
        return !this.sockets.size;
    }

    get size () {
        return this.sockets.size;
    }

}
