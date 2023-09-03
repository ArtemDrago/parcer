import fetch from 'node-fetch';
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import iconv from 'iconv-lite';
import {DOMParser} from '@xmldom/xmldom';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const parser = async () => {
  let total = [];

  const showResult = (data) => {
    // сюда можно добавить код который будет сохранять данные в бд
    // для примера я преобразовал данные в json и сохранил локально

    let result = JSON.stringify(data);
    let resFile = fs.createWriteStream(__dirname + '/result/result.txt');
    resFile.write(result);
    console.log('результат находиться по адресу '+ __dirname + '/result/result.txt');
  };

  // проверка существования файла и его удаление
  const checkAndDeliteFile = (pathToFile) => {
    fs.access(pathToFile, function(error){
      if (error) {
          console.log("Файл не найден");
      } else {
        fs.unlink(pathToFile, err => {
          if(err) throw err; // не удалось удалить файл
        });
      }
    });
  };

  // преобразование xml элементов в итоговый массив
  const transformElemToObj = (el, account) => {
    let bic = el.getAttribute('BIC');
    let curName = el.getElementsByTagName('ParticipantInfo')[0];
    let name = curName.getAttribute('NameP');

    return {
      bic,
      name,
      corrAccount:account
    };
  };

  // получение файлов из папки
  let getFiles = function (dir,format, files_){
    files_ = files_ || [];
      var files = fs.readdirSync(dir);
      for (var i in files){
          var name = dir + '/' + files[i];
          if (fs.statSync(name).isDirectory()){
              getFiles(name, files_);
          } else {
            let cur = name.split('.');

            if (cur[cur.length - 1] == format) {
              files_.push(name);
            }
            cur = null;
          }
      }
      return files_;
  };

  //  сохранение zip архива
  const saveZIPFile = async (res, savePath) => {
    return new Promise((resolve) => {
      res.body.pipe(fs.createWriteStream(path.resolve(savePath)));

      res.body.on('end', () => {
        setTimeout(() => {
          resolve();
        }, 1000);
      });
    });
  };

  (function() {
    if (!fs.existsSync(__dirname + '/zip')){
      fs.mkdir('zip', err => {
        if(err) throw err; // не удалось создать папку
        console.log('Папка успешно создана');
      });
    }
    if (!fs.existsSync(__dirname + '/xml')){
      fs.mkdir('xml', err => {
        if(err) throw err; // не удалось создать папку
        console.log('Папка успешно создана');
      });
    }
    if (!fs.existsSync(__dirname + '/decoder')){
      fs.mkdir('decoder', err => {
        if(err) throw err; // не удалось создать папку
        console.log('Папка успешно создана');
      });
    }
    if (!fs.existsSync(__dirname + '/result')){
      fs.mkdir('result', err => {
        if(err) throw err; // не удалось создать папку
        console.log('Папка успешно создана');
      });
    }
  })();

    // основная функция 
    try {
      const res = await fetch('http://www.cbr.ru/s/newbik');

      if (!res.ok) {
        throw new Error(res.statusText || res.status);
      }
    
      const filename = res.headers.get('content-disposition')?.split(/\s*;\s*/).find((x) => x.startsWith('filename='))?.replace(/^filename=["']?|["']$/g, '')
      || 'archive.zip';

      const savePath = __dirname +'/zip/'+ filename;

      await saveZIPFile(res, savePath);
 
      let zip = new AdmZip(path.resolve(savePath));

      if (zip) {
        zip.extractAllTo("./xml", true);
      }

      const decodeXml = () => {
        let xmlFiles = getFiles(__dirname +'/xml', 'xml');

        if (xmlFiles.length != 0) {  
          // удаление не zip используемого архива
          if (savePath != undefined && savePath.length != 0) {
            checkAndDeliteFile(savePath);
          }
          //потоковая декодеровка
          xmlFiles.forEach((element, indx) => {
            fs.createReadStream(element)
            .pipe(iconv.decodeStream('win1251'))
            .pipe(iconv.encodeStream('utf-8'))
            .pipe(fs.createWriteStream('decoder/decoder_'+indx+'.xml'));
          });
        };
        return xmlFiles;
      };
     
      const createTotalArr = (xml) => {
        // удаляем не используемые xml файлы из папки xml
        if (xml != undefined && xml.length != 0) {
            xml.forEach(el => {
              checkAndDeliteFile(el);
            });
        }
        let decodXmlFiles = getFiles(__dirname +'/decoder', 'xml');

        if (decodXmlFiles.length != 0) {
          try {
            let fileContent = fs.readFileSync(decodXmlFiles[0], 'utf8');
            const doc = new DOMParser().parseFromString(fileContent, 'text/xml');
            let caseWrapper = doc.getElementsByTagName('BICDirectoryEntry');
            const xmlArr = Array.from(caseWrapper);
  
            if (xmlArr.length != 0) {
 
              for(let i = 0; i <= xmlArr.length - 1;i++) {
                let curAccount = xmlArr[i].getElementsByTagName('Accounts');
                if (curAccount.length == 0) {
                  continue;
                }
                const accArr = Array.from(curAccount);

                if (accArr.length != 0) {
                  for (let j = 0; j < accArr.length; j++) {
                    let accAtribute = accArr[j].getAttribute('Account');
                    if (accAtribute.length == 0) {
                      continue;
                    } else {
                      total.push(transformElemToObj(xmlArr[i], accAtribute));
                    }
                  }
                }
              }
            }

          } catch (error) {
            console.log(error)
          }
        }
      };

      new Promise((resolve, reject) => {
        let xml = decodeXml();
        setTimeout(() => {
          resolve(xml);
        },100);
      }).then((val) => {
        createTotalArr(val);
      }).then(() => {
        showResult(total);
      });
    } catch (err) {
      console.error(err);
    }
};
await parser();

