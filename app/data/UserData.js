const User = require('./models/UserModel')

function validateOptions (options) {
    if (options.offset === undefined || typeof options.offset !== 'number')
        throw new Error(`offset cannot be ${options.offset}`)

    if (options.limit === undefined || typeof options.limit !== 'number')
        throw new Error(`limit cannot be ${options.limit}`)

    if (options.show && typeof options.show !== 'string')
        throw new Error(`show cannot be ${options.show}`)

    if (options.hide && typeof options.hide !== 'string')
        throw new Error(`hide cannot be ${options.hide}`)
}

function normalizePlaylist (data) {
    return data.playlists.map(function(item) {
        return {
          id: item._id,
          name: item.name,
          description: item.description,
          amount: itme.amount,
          creation_date: item.creation_date,
          last_modified: item.last_modified
        }
    })
}

class UserData {
    _isInTheList (userId, list, condition) {
        const filter = {}; filter._id = userId; filter[list] = condition
        const projection = {}; projection._id = 0; projection[list + '.$'] = 1

        return User.findOne(filter, projection).exec() // Para que devuelva un Promise.
    }

    _query (validate, conditions, options, single) {
        return Promise.resolve()
            .then(() => {
                if (validate) validate()

                if (!single) validateOptions(options)

                let projection = {} // ex: { _id: 0, restaurant_id: 1 }

                if (options.hide)
                    options.hide.split(',').forEach(field => projection[field] = 0)
                if (options.show)
                    options.show.split(',').forEach(field => projection[field] = 1)

                options.select = projection

                if (options.slice) {
                    projection = Object.assign(projection, options.slice)
                }

                return single
                    ? User.findOne(conditions, projection)
                    : User.paginate(conditions, options)
            })
    }

    updateLastLogin (userId) {
        return User.findOneAndUpdate(userId, { last_login: new Date() } )
            .exec() // Para que devuelva un Promise.
    }

    updateUserVerified (user, options) {
        return false
    }

    getIdByUsername (username) {
        return this._query(() => {
                if (!username) throw new Error(`username cannot be ${username}`)
            }, { username }, { show: '_id' }, true)
            .then( docs => { return docs ? docs.id : null })
    }

// /user
    getUserProfile (userId) {
        return this._query(() => {
                if (!userId) throw new Error(`userId cannot be ${userId}`)
            }, { _id: userId }, { hide: '_id,playlists._id,friends._id' }, true)
            .then( docs => { console.log(docs); return docs })
    }

    updatePushNotificationToken(userId, pnToken) {
        return User.findOneAndUpdate(
            { _id: userId },
            { 'push_notification_token': pnToken },
            { new: true, fields: { '_id': 0, 'username': 1, 'push_notification_token': 1 } })
            .exec() // Para que devuelva un Promise.
    }

// /user/friends
    searchByUsername(username) {
        return User.find({ username: { '$regex': username, '$options': 'i' } }, { _id: 1, username: 1 })
            .exec() // Para que devuelva un Promise.
    }

    searchMyFriendsByUsername(userId, username,friendName) {
        return User.aggregate(
                { $match: { 'username': username } },
                { $unwind: '$friends' },
                { $match: { 'friends.username': { '$regex': friendName, '$options': 'i' } } },
                { $project : { '_id': 0, 'friends' : 1 } }
            )
            .then(docs => {
                const result = []
                docs.map(d => result.push(d.friends) )
                return result
            })
    }

    getFriends (userId, options) {
        options.show = 'friends._id,friends.username,friends.confirmed,friends.last_modified'
        options.slice = { friends: { $slice: [options.offset, options.limit] } }
        return this._query(() => {
                if (!userId) throw new Error(`userId cannot be ${userId}`)
            }, { _id: userId }, options, true)
            .then(({friends}) => friends)
    }

    getAllMyFriends (userId, options) {
        options.show = 'friends._id,friends.username,friends.confirmed,friends.last_modified'
        return this._query(() => {
                if (!userId) throw new Error(`userId cannot be ${userId}`)
            }, { _id: userId }, options, true)
            .then(({friends}) => friends)
    }

    retrievePnTokenById (userId) {
        return this._query(() => {
                if (!userId) throw new Error(`userId cannot be ${userId}`)
            }, { _id: userId }, { show: 'username,push_notification_token' }, true)
    }

    retrieveFriendById (userId, friendId) {
        return this._isInTheList(userId, 'friends', { $elemMatch: { _id: friendId } })
            .then(docs => { return docs ? docs.friends[0] : null })
    }

    addFriend (userId, friendId, friend) {
        const fields = { 'friends._id': 1, 'friends.username': 1, 'friends.confirmed': 1, 'friends.last_modified': 1 }
        return  User.findOneAndUpdate(
            { _id: userId },
            { $push: { friends: { 
                $each: [{ _id: friendId, username: friend }],
                $sort: { last_modified: -1, confirmed: -1 } 
            } } },
            { safe: true, upsert: false, new: true, fields })
            .exec() // Para que devuelva un Promise.
            .then(({friends}) => friends)
    }

// /user/friends/:friend
    _reorderFriends (userId) {
        const fields = { 'friends._id': 1, 'friends.username': 1, 'friends.confirmed': 1, 'friends.last_modified': 1 }
        return  User.findOneAndUpdate(
            { _id: userId },
            { $push: { friends: { 
                $each: [],
                $sort: { last_modified: -1, confirmed: -1 } 
            } } },
            { safe: true, upsert: false, new: true, fields })
            .exec() // Para que devuelva un Promise.
            .then(({friends}) => friends)
    }

    updateFriendship (userId, friendId) {
        const fields = { 'friends._id': 1, 'friends.username': 1, 'friends.confirmed': 1, 'friends.last_modified': 1 }
        return User.findOneAndUpdate(
            { _id: userId, 'friends._id': friendId },
            { 'friends.$.confirmed': true,
              $currentDate: { 'friends.$.last_modified': true }
            },
            { safe: true, upsert: false, new: true, fields })
            .exec() // Para que devuelva un Promise.
            .then(this._reorderFriends(userId))
    }

    removeFriend (userId, friendId) {
        return User.findOneAndUpdate(
            { _id: userId },
            { $pull: { friends: { _id: friendId } } },
            { new: true, fields: { 'friends._id': 1, 'friends.username': 1, 'friends.confirmed': 1 } })
            .exec() // Para que devuelva un Promise.
            .then(({friends}) => friends)
    }

// /user/playlists
    getAllMyPlaylists (userId, options) {
        options.show = 'playlists.name,playlists._id,playlists.description,playlists.amount'
        return this._query(() => {
                if (!userId) throw new Error(`userId cannot be ${userId}`)
            }, { _id: userId }, options, true)
            .then(({playlists}) => playlists)
    }

    getPlaylists (userId, options) {
        options.show = 'playlists.name,playlists._id,playlists.amount,playlists.creation_date,playlists.description,playlists.last_modified'
        options.slice = { playlists: { $slice: [options.offset, options.limit] } }
        return this._query(() => {
                if (!userId) throw new Error(`userId cannot be ${userId}`)
            }, { _id: userId }, options, true)
            .then(({playlists}) => playlists)
    }

    retrievePlaylistIdByName (userId, name) {
        return this._isInTheList(userId, 'playlists', { $elemMatch: { name } })
    }

    addPlaylist (userId, name, description) {
        const fields = {
          'playlists._id': 1,
          'playlists.name': 1,
          'playlists.amount': 1,
          'playlists.creation_date': 1,
          'playlists.last_modified': 1,
          'playlists.description': 1
        }
        return User.findOneAndUpdate(
            { _id: userId },
            { $push: { playlists: { name, description } } },
            { safe: true, upsert: true, new: true, fields })
            .exec() // Para que devuelva un Promise.
            .then(({playlists}) => playlists)
    }

// /user/playlists/:playlistId
    getTracksFromPlaylist (userId, playlistId) {
        const projection = { _id: 0, 'playlists.$.tracks': 1 }
        return User.findOne({ _id: userId, 'playlists._id': playlistId }, projection)
            .exec()
            .then(({playlists}) => playlists[0].tracks)
            //.then(({playlists:{tracks}}) => { console.log(tracks); return tracks})
    }

    removePlaylist (userId, playlistId) {
        const fields = {
          'playlists._id': 1,
          'playlists.name': 1,
          'playlists.amount': 1,
          'playlists.creation_date': 1,
          'playlists.last_modified': 1,
          'playlists.description': 1
        }

        return User.findOneAndUpdate(
            { _id: userId },
            { $pull: { playlists: { _id: playlistId } } },
            { new: true, fields })
            .exec() // Para que devuelva un Promise.
            .then(({playlists}) => playlists)
    }

// /user/playlists/:playlistId/track/:trackId
    addTrackToPlaylist (userId, playlistId, track) {
        return User.findOneAndUpdate(
            { _id: userId, 'playlists._id': playlistId },
            { $push: { 'playlists.$.tracks': track },
              $inc: { 'playlists.$.amount': 1 },
              $currentDate: { 'playlists.$.last_modified': true }
            },
            { safe: true, new: true, fields: { 'playlists': { $elemMatch: { _id: playlistId } } } })
            .exec() // Para que devuelva un Promise.
            .then(({playlists}) => playlists[0].tracks)
    }

    removeTrackFromPlaylist(userId, playlistId, track) {
        return User.findOneAndUpdate(
            { _id: userId, 'playlists._id': playlistId },
            { $pull: { 'playlists.$.tracks': track },
              $inc: { 'playlists.$.amount' : -1 },
              $currentDate: { 'playlists.$.last_modified': true }
            },
            { safe: true, new: true, fields: { 'playlists': { $elemMatch: { _id: playlistId } } } })
            .exec() // Para que devuelva un Promise.
            .then(({playlists}) => playlists[0].tracks)
    }

// /user/location
    updateLastCoordinates(userId, coordinates) {
        return Promise.resolve()
            .then( () => { throw new Error('not implemented yet') })
    }
}
// exportamos uns singleton...
module.exports = new UserData()
