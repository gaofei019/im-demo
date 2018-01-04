"use strict";
const http = require('http');
const fs = require('fs');
const urlLib = require('url');
const querystring = require('querystring');
const EventEmitter = require('events').EventEmitter;
const io=require('socket.io');
const reg=require('./reg.js');

var E = new EventEmitter();

var httpServer = http.createServer(function(req,res){
    //get数据
    req.get = urlLib.parse(req.url,true).query;
    req.url = urlLib.parse(req.url,true).pathname;

    E.emit('parse-post',req,res);
});

httpServer.listen(8081);

function wsChat(){
    var wsServer=io.listen(httpServer);
    var arr=[];
    var users={};//name:password
    wsServer.on('connection',function(sock){
        var cur_user='';
        arr.push(sock);

        sock.on('reg',function(username, password){
            username=username.toLowerCase();

            if(users[username]){
                sock.emit('reg_result', {ok: false, msg: '用户名已存在'});
            }else if(reg.username.test(username)==false){
                sock.emit('reg_result', {ok: false, msg: '用户名不符合要求'});
            }else if(reg.password.test(password)==false){
                sock.emit('reg_result', {ok: false, msg: '密码过短'});
            }else{
                users[username]=password;
                sock.emit('reg_result',{ok:true,msg:'注册成功'});
            }
        });
        sock.on('login',function(username,password){
            username=username.toLowerCase();

            if(reg.username.test(username)==false){
                sock.emit('login_result',{ok:false,msg:'用户名有误'});
            }else if(reg.password.test(password)==false){
                sock.emit('login_result',{ok:false,msg:'密码有误'});
            }else if(!users[username]){
                sock.emit('login_result',{ok:false,msg:'此用户不存在'});
            }else if(users[username]!=password){
                sock.emit('login_result',{ok:false,msg:'用户名或密码有误'});
            }else{
                cur_user=username;
                sock.emit('login_result',{ok:true,msg:'登录成功'});
            }
        });

        sock.on('post_msg',function(text,to){
            console.log('收到了',text,to);
            to && (to=to.toLowerCase());
            if(users[to]==null){
                to=null;
            }

            //{text,from: xxx, to:xxx}
            for(var i=0;i<arr.length;i++){
                if(arr[i]==sock)continue;

                arr[i].emit('post_msg_result',{text: text, from: cur_user, to: to});
            }
        });

        sock.on('disconnect',function(){
            //arr -> sock
            for(var i=0;i<arr.length;i++){
                if(arr[i]==sock){
                    arr.splice(i--, 1);
                }
            }
        });
    });
};

wsChat();//执行



E.on('parse-post',function(req,res){
    var str='';
    req.on('data',function(s){
        str+=s;
    });
    req.on('end',function(){
        req.post=querystring.parse(str);

        //cookie
        E.emit('parse-cookie',req,res);
    });
});

E.on('parse-cookie',function(req,res){
    req.cookie=querystring.parse(req.headers['cookie'],'; ');

    //session
    E.emit('parse-session',req,res);
});

E.on('parse-session',function(req,res){
    if(!req.cookie.sessid){
        req.cookie.sessid=''+Date.now()+Math.random();
    }

    fs.readFile('session/'+req.cookie.sessid,function(err,data){
        if(err){
            req.session={};
        }else{
            req.session=JSON.parse(data.toString());
        }

        //处理业务
        E.emit('buss-on',req,res);
    });
});
E.on('buss-on',function(req,res){
    //sessid写回客户端
    res.setHeader('set-cookie','sessid='+req.cookie.sessid);
    //数据
    console.log(
        req.get,
        req.post,
        req.cookie,
        req.session,
        req.url
    );
    //数据
    var bool=E.emit(req.url,req,res);

    if(bool==false){
        //读取www静态文件
        E.emit('read-www-file',req,res);
    }
});

//接口---开始
E.on('/nav',function(req,res){
    res.write(JSON.stringify([
        {text:'首页',href:'/index.html'},
        {text:'公司简介',href:'/index.html'},
        {text:'产品展示',href:'/index.html'},
        {text:'联系我们',href:'/index.html'},
        {text:'关于我们',href:'/about.html'}
    ]));
    E.emit('write-session',req,res);
});
//接口---结束

E.on('read-www-file',function(req,res){
    fs.readFile('www/'+req.url,function(err,data){
        if(err){
            res.writeHeader(404);
            res.write('404');
        }else{
            res.write(data);
        }
        E.emit('write-session',req,res);
    });
});

E.on('write-session',function(req,res){
    fs.writeFile('session/'+req.cookie.sessid,JSON.stringify(req.session),function(err){
        E.emit('end',req,res);
    });
});

E.on('end',function(req,res){
    res.end();
});
console.log('服务器正常！');