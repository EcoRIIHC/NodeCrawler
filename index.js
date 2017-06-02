const superagent = require('superagent')
const cheerio = require('cheerio')
const async = require('async')
const crypto = require('./lib/Crypto.js')
const http = require('http')
const fs = require('fs')
const path = require('path')
const request = require('request')

// 页面地址
const url = 'http://music.163.com'
const playListUrl = url + '/discover'
const songListUrl = url + '/api/playlist/detail?id='
const songDetailUrl = url + '/api/song/detail/?id=#{id}&ids=[#{id}]'
const songHrefUrl = url + '/weapi/song/enhance/player/url?csrf_token='

let songDir = './songs/'
let songFile = './songs/song.txt'

console.log('start processing')

// 播放列表
let playList = []
// 歌曲id列表
let songList = []
// 歌曲下载地址列表
let songHref = []

// 获取网易云音乐首页热门播放列表
superagent
    .get(playListUrl)
    .end((err, res) => {
        let $ = cheerio.load(res.text, {decodeEntities: true})

        playListArr = $('.u-cover.u-cover-1 > a')
        // 获取播放列表
        playListArr.each((i, item) => {
            let tmp = {
                id: item.attribs.href.split('=').pop(),
                title: item.attribs.title,
                href: item.attribs.href
            }
            playList.push(tmp)
        })
        console.log('get song list .....done')
        // playList.forEach((item, i) => {
        //     getSongs(item)
        // })
        getSongs(playList[0])
    })
// 根据播列表id获取下面的歌曲ids
const getSongs = (item) => {
    superagent
        .get(songListUrl + item.id)
        .end((err, res) => {
            let playListInfo = JSON.parse(res.text)
            if (!playListInfo.result) {
                return
            }
            playListInfo.result.tracks.forEach((item, i) => {
                let tmp = {
                    id: item.id,
                    name: item.name
                }
                songList.push(tmp)
            })
            console.log('获取播放列表' + item.title + '下的歌曲')
            songList.forEach((item, i) => {
                getSongHref (item)
            })
        })
}

// 获取歌曲下载地址
const getSongHref = (item) => {
    superagent
        .post(songHrefUrl)
        .send(crypto.aesRsaEncrypt(JSON.stringify({
            ids: [item.id],
            br: 999000,
            csrf_token: ''
        })))
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .set('Origin', 'http://music.163.com')
        .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/35.0.1916.157 Safari/537.36')
        .set('Cookies', 'os=pc; osver=Microsoft-Windows-10-Professional-build-10586-64bit; appver=2.0.3.131777; channel=netease; __remember_me=true')
        .set('Referer', 'http://music.163.com/')
        .end((err, res) => {
            res = JSON.parse(res.text)
            let tmp = {
                id: item.id,
                name: item.name,
                url: res.data[0].url
            }
            songHref.push(tmp)

            download(tmp)

            console.log(tmp)
        })
}

// 下载歌曲
const download = (item) => {
    item.name = item.name.replace(/\//g, '-')
    request(item.url).pipe(fs.createWriteStream(songDir + item.name + '.mp3'))
}

// 下载歌曲原生版本，原生的http.request没法下载重定向后的文件，先使用request代替了
const downloadOrigin = (item) => {

    let req = http.request(item.url, (res) => {
        console.log('res.statusCode: ' + res.statusCode)
        let fileBuff = []
        let fileName = path.basename(item.name + '.mp3')
        res.on('data', (chunk) => {
            console.log('data is coming')
            let buffer = new Buffer(chunk)
            fileBuff.push(buffer)
            console.log(fileBuff)
        })
        res.on('end', () => {
            console.log('req end')
            console.log(fileBuff)
            let totalBuff = Buffer.concat(fileBuff)

            fs.appendFile(songDir +　fileName, totalBuff, (err) => {
                console.log(err)
            })
        })
    })

    req.on('error', (err) => {
        console.log(err)
    })
    req.end()
}

// setTimeout( () => {
//     fs.appendFile(songFile, JSON.stringify(songHref), (err) => {
//         if (err) {
//             throw err
//         }
//     })
// }, 5000)
// 写入文件
// fs.appendFile(songFile, JSON.stringify(tmp), (err) => {
//     if (err) {
//         throw err
//     }
// })