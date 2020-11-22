## larfoss NodeJS Connector

> 这是一个基于 Aliyun OSS用于  vue-laravel-file-manager 的nodejs连接器

![larfoss](E:\VSCode\vue-practice\personality_project\file-manager-backend\上传Github\文件管理器\阿里云OSS版\修改上传版\larfOss-node\tempfile\larfOss.gif)

本连接器的Windows和Linux版本：https://github.com/refinec/larf-node

## 安装

```
npm install larfoss-node --save
```

## 用法

此包应作为中间件实现 express.js服务器

```javascript
const express = require("express");
const app = express();
const larfOss = require("larfoss-node");

const ossOptions = {
    accesskey: '', //通过阿里云控制台创建的AccessKey
    accessSecret: '', //通过阿里云控制台创建的AccessSecret
    bucket: '', //通过控制台或PutBucket创建的bucket
    region: '', //bucket所在的区域， 默认oss-cn-hangzhou。
    internal: false, //是否使用阿里云内网访问，默认false。比如通过ECS访问OSS，则设置为true，采用internal的endpoint可节约费用。
    cname: false, //是否支持上传自定义域名，默认false。如果cname为true，endpoint传入自定义域名时，自定义域名需要先同bucket进行绑定。
    secure: false, //(secure: true)则使用HTTPS，(secure: false)则使用HTTP
    endpoint: '', //OSS外网域名
    internalEndpoint:'' //OSS内网域名，可省略则默认为OSS外网域名
}

app.use('/', larfOss(ossOptions));
app.listen( process.env.PORT || 3000);
```

## 修改使用

**注意：**由于Aliyun OSS的限制，你需要修改 vue-laravel-file-manager 的部分代码以更好地使用。

1. 在 `Thumbnail.vue` 和 `Preview.vue` 文件的`loadImage`方法中注释源代码，添加以下代码：

   ```javascript
   loadImage() {
       GET.thumbnailLink(this.selectedDisk,this.selectedItem.path).then(response =>{
           this.imgSrc = response.data;
       })
   }
   ```

2. 在`AudioPlayer.vue`和`VideoPlayer.vue`文件的`mounted`生命钩子中注释源代码，添加以下代码：

   ```javascript
   mounted() {
       this.player = new Plyr(this.$refs.fmVideo);
       HTTP.get(this.$store.getters["fm/settings/baseUrl"] + "stream-file", {
         params: {
           disk: this.selectedDisk,
           path: this.videoFile.path,
         },
       }).then((response) => {
         this.player.source = {
           type: "video",
           title: this.videoFile.filename,
           sources: [
             {
               src: response.data,
               type: `audio/${this.videoFile.extension}`,
             },
           ],
         };
       });
   }
   ```

3. 在`contextMenuActions.js`文件的`downloadAction`方法的 if语句块中注释源代码，添加以下代码：

   ```javascript
   HTTP.downloadFile(this.selectedDisk, this.selectedItems[0].path).then((response) => {
       if (typeof response.data === 'string' && /\.txt$/g.test(this.selectedItems[0].path)) {
           tempLink.href = window.URL.createObjectURL(new Blob([response.data]));
       } else {
           tempLink.href = response.data;
       }
       document.body.appendChild(tempLink);
       tempLink.click();
       document.body.removeChild(tempLink);
   });
   ```

4. 在`get.js`文件中添加一个get请求方法：

   ```javascript
   downloadFile(disk, path) {
       return HTTP.get('download-file', {
           params: {
               disk,
               path
           },
       });
   },
   ```

   

