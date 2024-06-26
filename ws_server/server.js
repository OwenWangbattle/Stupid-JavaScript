const http = require("http");
const server = http.createServer((req, res) => {});

const io = require("socket.io")(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"],
        allowedHeaders: ["my-custom-header"],
        credentials: true,
    },
});

const rooms = {};

io.on("connection", (socket) => {
    console.log("A user connected");
    let currentRoom = null;

    socket.on("fetch room", (_) => {
        console.log("fetch room");
        socket.emit(
            "room update",
            Object.keys(rooms).map((room) => {
                return {
                    name: room,
                    status: rooms[room].status,
                    player_count: rooms[room].player_count,
                    players: rooms[room].players,
                    host: rooms[room].host,
                };
            })
        );
    });

    socket.on("create room", (message) => {
        const { name, pwd } = message;
        if (!rooms[name]) {
            rooms[name] = {
                pwd,
                status: "waiting",
                player_count: 0,
                players: [],
                host: socket.id,
            };
        } else socket.emit("error", "name exist");
    });

    // socket.on("delete room", (message) => {});

    socket.on("join room", (message) => {
        const { name, pwd } = message;
        console.log(`join room: ${name}`);
        if (
            rooms[name] &&
            // rooms[name].pwd === pwd &&       this is a to do
            rooms[name].status === "waiting" &&
            rooms[name].player_count <= 2
        ) {
            currentRoom = name;
            socket.join(currentRoom);
            for (const player of rooms[currentRoom].players)
                socket.emit("user join", player.id);
            rooms[currentRoom].player_count += 1;
            rooms[currentRoom].players.push({
                id: socket.id,
                status: "unready",
            });
            io.to(currentRoom).emit("user join", socket.id);
        } else socket.emit("error", "join room failed");
    });

    socket.on("leave room", (_) => {
        try {
            if (currentRoom) {
                socket.leave(currentRoom);
                io.to(currentRoom).emit("user left", socket.id);
                rooms[currentRoom].player_count -= 1;
                rooms[currentRoom].players = rooms[currentRoom].players.filter(
                    (item) => item.id !== socket.id
                );
                if (rooms[currentRoom].player_count === 0)
                    delete rooms[currentRoom];
                currentRoom = null;
            }
        } catch (e) {
            socket.emit("error", "leave room failed");
        }
    });

    socket.on("ready", (message) => {
        if (!currentRoom) socket.emit("error", "hasn't joined a room");
        else if (rooms[currentRoom]) {
            const player = rooms[currentRoom].players.find(
                (player) => player.id == socket.id
            );
            if (player) {
                player.status = "ready";
                socket.to(currentRoom).emit("user ready", socket.id);
            } else socket.emit("error", "player not in room");
        } else socket.emit("error", "room does not exist");
    });

    socket.on("unready", (message) => {
        if (!currentRoom) socket.emit("error", "hasn't joined a room");
        else if (rooms[currentRoom]) {
            const player = rooms[currentRoom].players.find(
                (player) => player.id == socket.id
            );
            if (player) {
                player.status = "unready";
                socket.to(currentRoom).emit("user unready", socket.id);
            } else socket.emit("error", "player not in room");
        } else socket.emit("error", "room does not exist");
    });

    socket.on("start game", (message) => {
        if (!currentRoom) socket.emit("error", "hasn't joined a room");
        else if (rooms[currentRoom]) {
            if (socket.id == rooms[currentRoom].host) {
                // for (player in rooms[currentRoom].players) {
                //     if (player.status != "ready") {
                //         socket.emit("error", "Not all players are ready");
                //         return;
                //     }
                // }
                rooms[currentRoom].status = "started";
                socket.to(currentRoom).emit("game start");
            } else {
                socket.emit("error", "Sorry, only host can start the game!");
            }
        } else socket.emit("error", "room does not exist");
    });

    socket.on("map confirm", (message) => {
        socket.to(currentRoom).emit("map", message);
    });

    socket.on("game payload", (message) => {
        socket.to(currentRoom).emit("player action", message);
    });

    socket.on("disconnect", (reason) => {
        if (currentRoom) {
            io.to(currentRoom).emit("user left", socket.id);
            rooms[currentRoom].player_count -= 1;
            rooms[currentRoom].players = rooms[currentRoom].players.filter(
                (item) => item.id !== socket.id
            );
            if (rooms[currentRoom].player_count === 0)
                delete rooms[currentRoom];
            currentRoom = null;
        }
    });
});

server.listen(3001, () => {
    console.log("WebSocket server listening on port 3001");
});
