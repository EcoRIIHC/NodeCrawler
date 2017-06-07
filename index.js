const superagent = require('superagent')
const cheerio = require('cheerio')
const async = require('async')
const crypto = require('./lib/Crypto.js')
const http = require('http')
const fs = require('fs')
const path = require('path')
const request = require('request')
const mysql = require('mysql')
// 页面地址
const url = 'http://music.163.com'
const playListUrl = url + '/discover'
const songListUrl = url + '/api/playlist/detail?id='
const songDetailUrl = url + '/api/song/detail/?id=#{id}&ids=[#{id}]'
const songHrefUrl = url + '/weapi/song/enhance/player/url?csrf_token='
// let songDir = './songs/'
// nginx下歌曲 路径
const songDir = 'D:/WorkSpace/ReactPlayer/nginx-1.13.1/html/songs/'
const songFile = './songs/song.txt'
// 服务器地址
const server = 'http://localhost/songs/'


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
        getSongs(playList[1])
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
                    name: item.name,
                    singer: ((item.artists || []).map((value) => {
                        return value.name
                    })).join(',') || '',
                    album: item.album.name,
                    time: ''
                }
                if (item.hMusic) {
                    tmp.time = formatTime(item.hMusic.playTime)
                } else if (item.mMusic) {
                    tmp.time = formatTime(item.mMusic.playTime)
                } else if (item.bMusic) {
                    tmp.time = formatTime(item.bMusic.playTime)
                } else if (item.lMusic) {
                    tmp.time = formatTime(item.lMusic.playTime)
                } else {
                    tmp.time = formatTime(0)
                }
                songList.push(tmp)
            })
            console.log('获取播放列表' + item.title + '下的歌曲')
            var arr = songList.map((value, i) => {
                return function () {
                    getSongHref (value, item.title)
                }
                // getSongHref (value, item.title)
            })
            async.parallel(arr, (err, results) => {
                if (err) {
                    console.log(err)
                }
                console.log('async........done')
            })
        })
}

// 获取歌曲下载地址
const getSongHref = (item, playlistTitle) => {
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
            if (err) {
                console.log(err)
            }
            res = JSON.parse(res.text)
            let tmp = {
                id: item.id,
                name: item.name,
                singer: item.singer,
                time: item.time,
                album: item.album,
                url: res.data[0].url
            }
            songHref.push(tmp)

            download(tmp, playlistTitle)

            console.log(tmp)
        })
}

// 连接数据库
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'react_player'

})
connection.connect()
let sqlTpl = 'INSERT INTO songs (name, singer, time, album, url) VALUES("${name}", "${singer}", "${time}", "${album}", "${url}")'

/**
 * 下载歌曲
 *
 * @带url的歌曲对象 {any} item
 * @播放列表名称，用于保存路径 {any} playlistTitle
 */
const download = (item, playlistTitle) => {
    item.name = textFilter(item.name)
    playlistTitle = textFilter(playlistTitle)

    if (!fs.existsSync(songDir + playlistTitle)) {
        fs.mkdirSync(songDir + playlistTitle)
    }

    request(item.url)
        .on('error', (err) => {
            console.log('下载 '+ item.name + '出错')
            console.log(err)
        })
        .pipe(fs.createWriteStream(songDir + playlistTitle + '/' + item.name + '.mp3'))
        .on('end', () => {
            console.log('下载 ' + item.name + ' 完成')
        })
        .on('finish', () => {
            console.log('歌曲 ' + item.name + ' 下载完成')

            let sql = sqlTpl
                .replace('${name}', item.name)
                .replace('${singer}', item.singer)
                .replace('${time}', item.time)
                .replace('${album}', item.album)
                .replace('${album}', item.album)
                .replace('${url}', server + playlistTitle + '/' + item.name + '.mp3')
                console.log(sql)
            connection.query(sql, (err, result) => {
                if(err) {
                    console.log(err)
                }
            })
        })
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

// 过滤特殊字符
const textFilter = (text) => {
    return text
        .replace(/[:：|『』｜|，|｜()（）？?\\。\/]/g, '-')
}

// 格式化时间
const formatTime = (ms) => {
    let time = new Date(0, 0, 0, 0, 0, 0, ms)
    let minute = time.getMinutes() <= 10 ? '0' + time.getMinutes() : time.getMinutes()
    let second = time.getSeconds() <= 10 ? '0' + time.getSeconds() : time.getSeconds()
    return minute + ':' + second
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