const debug = require('debug')('usr')
const userData = require('../data/UserData')
const musicBusiness = require('./Music')
const pushNotification = require('../fcm')
const _ = require('lodash')

class User {
    updateLastLogin (userId) {
        return userData.updateLastLogin(userId)
    }

    updateUserVerified (user, options) {
        return false
    }

// /user
    getUserProfile (userId) {
        debug('getUserProfile', userId)
        return userData.getUserProfile(userId)
    }

    updatePushNotificationToken(userId, pnToken) {
        debug('updatePushNotificationToken', userId)
        return userData.updatePushNotificationToken(userId, pnToken)
    }

// /user/friends
    searchByUsername(userId, username, qs, options) {
        debug('searchByUsername', qs)
        return userData.searchMyFriendsByUsername(userId, username, qs.search)
            .then(friends => {
                if (qs.only_confirmed) _.remove(friends, { confirmed: false })
                return userData.searchByUsername(qs.search)
                    .then(users => {
                        _.remove(users, { username })
                        if (friends) friends.map(f => _.remove(users, { username: f.username }))
                        const total = qs.only_friends ? friends : friends.concat(users)
                        const page = {}
                        page.results = total.slice(options.offset, options.offset + options.limit)
                        page.results_count = page.results.length
                        page.results_fullcount = total.length
                        return page
                    })
            })
            
    }

    getFriends (userId, qs, options) {
        debug('getFriends', userId)
        return userData.getFriends(userId, options)
            .then(friends => {
                return userData.getAllMyFriends(userId, {})
                    .then(total => {
                        if (qs.only_confirmed) _.remove(friends, { confirmed: false })
                        const page = {}
                        page.results_count = friends.length
                        page.results_fullcount = qs.only_confirmed ? friends.length : total.length
                        page.results = friends
                        return page
                    })
            })
    }

    isAlreadyInFriendsList (userId, friend) {
        debug('isAlreadyInFriendsList', userId, friend)
        return userData.getIdByUsername(friend)
            .then(friendId => {
                if (friendId) {
                    return userData.retrieveFriendById(userId, friendId)
                        .then(friend => {
                            if (friend)
                                return { alreadyPresent: true, friendId }
                            else
                                return { alreadyPresent: false, friendId }
                        })
                }
                else return { alreadyPresent: false, friendId: undefined }
            })
    }

    addFriend (username, userId, friend) {
        debug('addFriend', username, userId, friend)
        return this.isAlreadyInFriendsList(userId, friend)
            .then(res => {
                if (res.alreadyPresent === false && res.friendId) {
                    userData.addFriend(userId, res.friendId, friend)
                        .then(res.alreadyPresent = true)
                        .catch(error => { throw new Error(error.message) })
                }

                if (res.alreadyPresent === true) {
                    return userData.retrievePnTokenById(res.friendId) 
                    .then(pnToken => {
                        const { push_notification_token } = pnToken

                        if (!push_notification_token)
                            throw new Error(`User ${friend} has no PN token.`)
                        
                        const message = {
                            type: 'friendship-request',
                            fromUser: username,
                            userId,
                            title: `Friend request`,
                            body: `from ${username}`,
                        }

                        return pushNotification.sendNotification(push_notification_token, message)
                    })
                }

                throw new Error(
                    res.friendId
                    ? `'${friend}' is already a friend.`
                    : `'${friend}' does not exist.`
                )
            })
    }

// /user/friends/:friendId
    updateFriendship (userId, username, friendId) {
        debug('updateFriendship', userId, username, friendId)
        return userData.updateFriendship(friendId, userId)
            .then(friends => {
                if (friends) {
                    return userData.retrievePnTokenById(friendId) 
                        .then(pnToken => {
                            const { push_notification_token, username: friendName } = pnToken

                            if (!push_notification_token)
                                throw new Error(`User '${friendName}' has no PN token.`)
                            
                            const message = {
                                type: 'confirmation',
                                fromUser: username,
                                userId,
                                title: `Friendship accepted`,
                                body: `from ${username}`
                            }

                        return pushNotification.sendNotification(push_notification_token, message)
                    })
                }

                throw new Error(`'${friendId}' is not your friend.`)
            })
    }

    removeFriend (userId, friendId) {
        debug('removeFriend', userId, friendId)
        return userData.removeFriend(userId, friendId)
            // .then(friends => { if (friends) { return friends.length } })
    }

// /user/friends/:friendId/track/:trackId
    sendTrackToFriend (username, userId, friendId, trackId) {
        debug('sendTrackToFriend', userId, friendId)
        return userData.retrieveFriendById(userId, friendId)
            .then(friend => {
                if (friend && friend.confirmed) {
                    return userData.retrievePnTokenById(friendId) 
                        .then(pnToken => {
                            const { push_notification_token } = pnToken

                            if (!push_notification_token)
                                throw new Error(`User ${friend.username} has no PN token.`)

                            return musicBusiness.getTracks({id: trackId})
                                .then(docs => {
                                    if (!docs)
                                        throw new Error(`Track ${trackId} does not exist.`)

                                    const message = {
                                        type: 'track',
                                        fromUser: username,
                                        userId,
                                        title: `${username} sent you this track`,
                                        body: docs.results[0].name,
                                        track: docs.results[0]
                                    }

                                    return pushNotification.sendNotification(push_notification_token, message)
                                })
    
                        })
                }

                throw new Error(
                    friend
                    ? `'${friend.username}' is not a confirmed friend.`
                    : `'${friendId}' does not exist.`
                )
            })
    }

// /user/playlists
    getPlaylists (userId, options) {
        debug('getPlaylists', userId)
        return userData.getPlaylists(userId, options)
            .then(playlists => {
                return userData.getAllMyPlaylists(userId, {})
                    .then(total => {
                        playlists.results_count = playlists.length
                        playlists.results_fullcount = total.length
                        return playlists
                    })
            })
    }

    existsThePlaylist (userId, playlist) {
        debug('existsThePlaylist', userId, playlist)
        return userData.retrievePlaylistIdByName(userId, playlist)
    }

    addPlaylist (userId, playlist, description) {
        debug('addPlaylist', userId, playlist)
        return this.existsThePlaylist(userId, playlist)
            .then(docs => {
                if (!docs)
                    return userData.addPlaylist(userId, playlist, description)
                        //.then(playlists => { return playlists.filter(p => p.name === playlist) })

                throw new Error(`${playlist} already exist.`)
            })
    }

// /user/playlists/:playlistId
    getTracksFromPlaylist (userId, playlistId, options) {
        debug('getTracksFromPlaylist', userId, playlistId)
        return userData.getTracksFromPlaylist(userId, playlistId, options)
            .then(tracks => {
                if (tracks.length > 0) {
                    const { offset, limit } = options
                    const filtered = {}
                    filtered.id = tracks.slice(offset, offset + limit).join('+')
                    return musicBusiness.getTracks(filtered)
                        .then(results => {
                            results.headers.results_fullcount = tracks.length
                            return results
                        })
                }
                
                const results = {}
                results.headers = {
                    results_count: 0,
                    results_fullcount: 0,
                }
                results.results = []
                return results

                //throw new Error(`no traks in ${playlistId}`)
            })
    }

    removePlaylist (userId, playlistId) {
        debug('removePlaylist', userId, playlistId)
        return userData.removePlaylist(userId, playlistId)
            // .then(playlists => { if (playlists) { return playlists.length } })
    }

// /user/playlists/:playlistId/track/:trackId
    isTrackAlredyInThePlaylist (userId, playlistId, track) {
        return userData.getTracksFromPlaylist (userId, playlistId)
            .then(tracks => {
                return tracks
                    ? tracks.filter( t => t == track)
                    : null
            })
    }

    addTrackToPlaylist (userId, playlistId, track) {
        debug('addTrackToPlaylist', userId, playlistId, track)
        return this.isTrackAlredyInThePlaylist(userId, playlistId, track)
            .then(tracks => {
                if (!tracks || tracks.length === 0) {
                    return userData.addTrackToPlaylist(userId, playlistId, track)
                        //.then(tracks => { return tracks.filter(t => t == track) })
                }

                throw new Error(`'${track}' alredy in '${playlistId}'.`)
            })
    }

    removeTrackFromPlaylist(userId, playlistId, track) {
        debug('removeTrackFromPlaylist', userId, playlistId)
        return userData.removeTrackFromPlaylist(userId, playlistId, track)
            // .then(tracks => { if (tracks) { return tracks.length } })
    }

// /user/location
    updateLastCoordinates(userId, coordinates) {
        return false
    }
}
// exportamos uns singleton...
module.exports = new User()
