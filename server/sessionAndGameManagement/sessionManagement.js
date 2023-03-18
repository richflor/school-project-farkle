const farkelRoom        = {}
const farkelUser        = {}
const farkelWinScore    = 2000
const farkelLimitRoom   = 6
const nbDice            = 5
const {
        isEnoughtSpaceInRoom,
        playerAlreadyExist,
        roomAlreadyExist,
        roomIsInGame,
        userIsReady,
        isTheOnlyOnePlayerInThisRoomInGame,
        isThisRoomIsEmpty,
        isTheUserWantToContinue,
        isThisPlayerIsTheWinner,
    } = require('./funcSessionManagement')

const GameTurn = require('../farkelgame')

/**
 * function for sending intel of room to every participant
 */
const sendIntelOfUserInRoom = (socket,room)=>{
    socket.emit('refreshListStatus',{payload : [farkelRoom[room]]})
    for(const user in farkelRoom[room]){
        if(user !== "nbUserInRoom" && user !== "inGame" ){
            socket.broadcast.to(user).emit('refreshListStatus',{payload : farkelRoom[room]})
        }
    }
}

/**
 * function for send win event to the last player in the room
 */
const gameDoneByTheLastPlayer = (socket,room)=>{
    let lastUser = farkelRoom[room]
    for (const key in lastUser) {
       if(lastUser[key] !== "selectPositionInGame" && lastUser[key] !== "nbUserInRoom" && lastUser[key] !== "inGame" && lastUser[key] !== "nbUserReady"){
            socket.broadcast.to(key).emit('gameWin',{reason : 1}) // gagner par forfait (tout le monde a abandonné)
       }
    }
}

/**
 * function for sending to everyone who is the winner
 */
const ThisPlayerIsTheWinner = (socket,Room,id)=>{
    for (const key in Room) {
        if(Room[key] !== "selectPositionInGame" && Room[key] !== "nbUserInRoom" && Room[key] !== "inGame" && Room[key] !== "nbUserReady"){
             socket.broadcast.to(key).emit('gameWin',{reason : 0,payload : Room[id]})
        }
     }
}

/**
 * function for create user in global liste
 */
const joinUserList = (payload,id)=>{
    farkelUser[id] = {
            name : payload.name,
            roomId : payload.roomId,
        }
}


/**
 * function for upgrade room or creating another
 */
const joinOrCreateSession = (data,id,buildRoom=false)=>{
    if(!buildRoom){
        farkelRoom[data.roomId].nbUserInRoom += 1
        farkelRoom[data.roomId] = {
            [id]:{
                idRoom              : data.roomId,
                ready2play          : false,
                currentScore        : 0,
                scoreTotal          : 0,
                myTurn              : false,
                isAlive             : true,
                name                : data.name,
                position            : farkelRoom[data.roomId].nbUserInRoom,
                canPlay             : false,
                nbDice              : nbDice,
                remainingDices     : [],
                scoringDices        : [],
            },
            ...farkelRoom[data.roomId],
        }
        return
    }
    farkelRoom[data.roomId] = {
        [id]:{
            idRoom              : data.roomId,
            ready2play          : false,
            currentScore        : 0,
            scoreTotal          : 0,
            myTurn              : true,
            isAlive             : true,
            name                : data.name,
            position            : 1,
            canPlay             : false,
            nbDice              : nbDice,
            remainingDices     : [],
            scoringDices        : [],
        },
        selectPositionInGame    : 1,
        nbUserInRoom            : 1,
        inGame                  : false,
        nbUserReady             : 0
    }
    return
}

/**
 * function to regulate login in server
 */

const manageLoginUser = (socket,payload)=>{
    if(playerAlreadyExist(farkelUser,socket.id)){                                           // control if user already exist 
        socket.emit('responseLogin',{state:false,reason:1})
    }
    else{
        if(roomAlreadyExist(farkelRoom,payload.roomId)){                                    // control if room targeted by the client exist
            if(!roomIsInGame(farkelRoom,payload.roomId)){                                   // control if game was started 
                if(isEnoughtSpaceInRoom(farkelRoom,farkelLimitRoom,payload.roomId)){        // control if room has enought space 
                    joinOrCreateSession(payload,socket.id)                                  // add client to the targeted room
                    joinUserList(payload,socket.id)                                         // add client to the global list of user
                    socket.emit('responseLogin',{state:true,reason:0})                      // send to client the confirmation that it's part of this room
                    sendIntelOfUserInRoom(socket,payload.roomId)                              // send to everyone in the room targeted intel about room 
                }else{
                    socket.emit('responseLogin',{state:false,reason:2})                     // send to client, the room is already full 
                }
            }else{
                socket.emit('responseLogin',{state:false,reason:4})                         // send to client, the room is not available because the game was already launched 
            }
        }else{
            joinOrCreateSession(payload,socket.id,true)                                     // build room and add user in this room
            joinUserList(payload,socket.id)
            socket.emit('responseLogin',{state:true,reason:0})                              // send to client the confirmation that it's part of this room
            sendIntelOfUserInRoom(socket,payload.roomId)                                      // send to everyone in the room targeted intel about room 
        }
    }
    console.log(farkelRoom)
}


/**
 * function for control disconnection
 */
const manageDisconnectionUser = (socket)=>{
    let idUserDisconnected        = socket.id
    if(playerAlreadyExist(farkelUser,idUserDisconnected)){
        let roomIdOfDisconnectedUser  = farkelUser[idUserDisconnected].roomId
        if(roomIsInGame(farkelRoom,roomIdOfDisconnectedUser)){
            delete farkelRoom[roomIdOfDisconnectedUser][idUserDisconnected]
            farkelRoom[roomIdOfDisconnectedUser].nbUserInRoom -= 1
            farkelRoom[roomIdOfDisconnectedUser].nbUserReady -= 1
            delete farkelUser[idUserDisconnected]
        }else{
            if(userIsReady(farkelRoom,idUserDisconnected,roomIdOfDisconnectedUser)){
                farkelRoom[roomIdOfDisconnectedUser].nbUserReady -= 1
            }
            if(roomAlreadyExist(farkelRoom,roomIdOfDisconnectedUser)){
                farkelRoom[roomIdOfDisconnectedUser].nbUserInRoom -= 1
                delete farkelRoom[roomIdOfDisconnectedUser][idUserDisconnected]
            }
        }
        sendIntelOfUserInRoom(socket,roomIdOfDisconnectedUser)
        manageRoomInCaseOfUserDisconnection(socket,roomIdOfDisconnectedUser)
    }
}


/**
 * function for handle room destruction
 */
const manageRoomInCaseOfUserDisconnection = (socket,roomIdOfDisconnectedUser)=>{

    if(isTheOnlyOnePlayerInThisRoomInGame(farkelRoom,roomIdOfDisconnectedUser)){
        gameDoneByTheLastPlayer(socket,roomIdOfDisconnectedUser)
        delete farkelRoom[roomIdOfDisconnectedUser]
    }else{
        manageInGameStateRoom(socket,roomIdOfDisconnectedUser)
    }
    if(isThisRoomIsEmpty(farkelRoom,roomIdOfDisconnectedUser)){
        delete farkelRoom[roomIdOfDisconnectedUser]
    }
    
    console.log("second ",farkelRoom)
}


/**
 * function to change readyState in waiting room
 */
const manageReadyStateUser = (socket)=>{
    if(playerAlreadyExist(farkelUser,socket.id)){
        let roomOfUserReady = farkelUser[socket.id].roomId
        if(!userIsReady(farkelRoom,socket.id,roomOfUserReady)){
            farkelRoom[roomOfUserReady][socket.id].ready2play = true
            farkelRoom[roomOfUserReady].nbUserReady += 1
            sendIntelOfUserInRoom(socket,roomOfUserReady)
        }
        manageInGameStateRoom(socket,roomOfUserReady)
        console.log('third ',farkelRoom)
    }
}


/**
 * function to close room to joining and start playing session
 */
const manageInGameStateRoom = (socket,room)=>{
    if(roomAlreadyExist(farkelRoom,room)){
        if((farkelRoom[room].nbUserInRoom === farkelRoom[room].nbUserReady) && farkelRoom[room].nbUserInRoom >= 2){
            farkelRoom[room].inGame = true
            setAllUserInThisRoomCanPlay(room)
            sendIntelOfUserInRoom(socket,room)
        }
    }
}

/**
 * function to activate all play possibility
 */
const setAllUserInThisRoomCanPlay = (room)=>{
    if(roomAlreadyExist(farkelRoom,room)){
        let roomAttributeCollection = farkelRoom[room]
        for(const key in roomAttributeCollection){
            if(roomAttributeCollection[key] !== "selectPositionInGame" && roomAttributeCollection[key] !== "nbUserInRoom" && roomAttributeCollection[key] !== "inGame" && roomAttributeCollection[key] !== "nbUserReady"){
                farkelRoom[room][key].canPlay = true
            }
        }
    }
}

const addCurrentScoreToScoreTotal = (room,socket)=>{
    if(playerAlreadyExist(farkelUser,socket.id)){
        let currentScore                            = farkelRoom[room][socket.id].currentScore
        farkelRoom[room][socket.id].scoreTotal      += currentScore
        farkelRoom[room][socket.id].currentScore    = 0
    }
    if(isThisPlayerIsTheWinner(farkelWinScore,farkelRoom[room][socket.id].scoreTotal)){
        ThisPlayerIsTheWinner(socket,farkelRoom[room],socket.id)
    }
}

const shiftingPlayer = (room)=>{
    let Room                     = Object.keys(farkelRoom[room])
    let allUserInRoom            = []
    let actualUser               = ""
    let nextPlayer               = ""

    console.log("room ",Room)
    for(let paramRoom=0;paramRoom<Room.length;paramRoom++){
        if(Room[paramRoom] !== "selectPositionInGame" && Room[paramRoom] !== "nbUserInRoom" && Room[paramRoom] !== "inGame" && Room[paramRoom] !== "nbUserReady"){
            allUserInRoom.push(Room[paramRoom])
        }
    }
    console.log("alluserinroom ",allUserInRoom)

    for(let user=0;user<allUserInRoom.length;user++){
        if(farkelRoom[room][allUserInRoom[user]].myTurn){
            actualUser = allUserInRoom[user]
            farkelRoom[room][actualUser].myTurn = false
        }
    }
    console.log("actualUser ",actualUser)
    console.log("position ",allUserInRoom.indexOf(actualUser))
    nextPlayer = (allUserInRoom.indexOf(actualUser)+1)%allUserInRoom.length
    console.log('next player',allUserInRoom[nextPlayer]," pos : ",nextPlayer)
    farkelRoom[room].selectPositionInGame = farkelRoom[room][allUserInRoom[nextPlayer]].position
    farkelRoom[room][allUserInRoom[nextPlayer]].myTurn = true
}

const resetUserLosing = (roomPlayer,id)=>{
    farkelRoom[roomPlayer][id].currentScore     = 0
    farkelRoom[roomPlayer][id].nbDice           = nbDice
    farkelRoom[roomPlayer][id].scoringDices     = []
    farkelRoom[roomPlayer][id].remainingDices   = []
}

const updateUserScoring = (roomPlayer,id,temporaryResult)=>{
    let result = temporaryResult
    farkelRoom[roomPlayer][id].currentScore     = result.score
    farkelRoom[roomPlayer][id].scoringDices     = result.scoring_dices
    farkelRoom[roomPlayer][id].remainingDices   = result.remaining_dices
    farkelRoom[roomPlayer][id].nbDice           = (result.isRetrivingAllDice)? nbDice : result.remaining_dices_number
}

const manageReturnGameAfterOneTimePlay = (socket,room,valueAfterOneTimePlay)=>{
    console.log(valueAfterOneTimePlay)
    if(valueAfterOneTimePlay.isLosing){
        socket.emit('loseThisOne')
        resetUserLosing(room,socket.id)
        shiftingPlayer(room)
    }else{
        socket.emit('oneMoreTime')
        updateUserScoring(room,socket.id,valueAfterOneTimePlay)
    }
}

const manageReturnGameWithoutPlay = (socket,room)=>{
    addCurrentScoreToScoreTotal(room,socket)
    resetUserLosing(room,socket.id)
    shiftingPlayer(room)
}


/**
 * function for managing choose of any player in room and declare a winner
 */
const manageChoiceInGame = (socket,payload)=>{
    if(playerAlreadyExist(farkelUser,socket.id)){
        let roomPlayer  = farkelUser[socket.id].roomId
        if(roomAlreadyExist(farkelRoom,roomPlayer)){
            if(roomIsInGame(farkelRoom,roomPlayer)){
                let userTurn = farkelRoom[roomPlayer][socket.id].myTurn
                if(userTurn){
                    if(isTheUserWantToContinue(payload.state)){
                        let game = new GameTurn({nb_dices_to_roll : farkelRoom[roomPlayer][socket.id].nbDice, score : farkelRoom[roomPlayer][socket.id].currentScore})
                        manageReturnGameAfterOneTimePlay(socket,roomPlayer,game.play())
                    }else{
                        manageReturnGameWithoutPlay(socket,roomPlayer)
                    }
                    sendIntelOfUserInRoom(socket,roomPlayer)
                }else{
                    socket.emit('notYourTurn')
                }
            }
        }
    }
}



const Farkel = (socket)=>{
    /**
     * event to manage client login in game
     */
    socket.on('loginEvent',(payload)=>{
        console.log("login : ",payload)
        manageLoginUser(socket,payload)
    })

    socket.on('clientIsReady',()=>{
        manageReadyStateUser(socket)
    })

    socket.on('myChoice',(payload)=>{
        console.log("CHOIX USER")
        console.log(payload.payload.state)
        manageChoiceInGame(socket,payload.payload)
    })

    socket.on('disconnect',()=>{
        console.log("deco : ",socket.id)
        manageDisconnectionUser(socket)
    })


}

module.exports =  {  
    Farkel
}