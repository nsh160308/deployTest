const express = require('express');
const multer = require('multer');
const router = express.Router();
const { Product } = require("../models/Product");


//=================================
//             Product
//=================================

//destinaton : 어디에 파일이 저장될 것인가
//filename : 파일이 저장될 때 어떤 이름으로 저장될 것인가
var storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, `${Date.now()}_${file.originalname}`)
    }
})

var upload = multer({ storage: storage }).single("file")


//express.js에서 제공하는 router를 이용해서 request요청 처리합니다.
//api/product를 타고서 왔기때문에 /api/product는 필요없습니다.
router.post('/image', (req, res) => {
    console.log('back1');
    //여기서 클라이언트 에서 보낸 이미지를 
    //multer 라이브러리를 사용해서 저장 합니다.
    //(req, file, cb)
    upload(req, res, err => {
        //console.log('back2', req);

        if(err) {
            return res.json({ success: false, err})
        }
        return res.json({ success: true, filePath: req.file.path, fileName: req.file.filename })
    })

})


router.post('/', (req, res) => {
    
    // 클라이언트에서 받은 정보들을 DB에 넣어 준다.
    const product = new Product(req.body)

    product.save((err) => {
        if(err) return res.status(400).json({ success: false, err })
        return res.status(200).json({ success: true })
    })

})

router.post('/products', (req, res) => {
    //product Collection에 들어 있는 모든 상품 정보 가져오기
    //find() => Collection안에 모든 정보를 찾는다.
    //populate(doc) => 해당 필드에 대한 모든 정보를 가져온다.
    let skip = req.body.skip ? parseInt(req.body.skip) : 0;
    let limit = req.body.limit ? parseInt(req.body.limit) : 20;

    let term = req.body.searchTerm
    
    let findArgs = {};

    for(let key in req.body.filters) {

        if(req.body.filters[key].length > 0) {

            console.log('key', key);

            if(key === "price") {
                findArgs[key] = {
                    //Greater than equal
                    $gte: req.body.filters[key][0],
                    //Less than equal
                    $lte: req.body.filters[key][1],
                }
            } else {
                findArgs[key] = req.body.filters[key];
            }

        }
    }

    console.log(`findArgs`,findArgs);

    //$text : 텍스트 검색 수행
    //$search : 검색할 값 Type => String
    if(term){
        Product.find(findArgs)
            .find({ $text: { $search: term }})
            .populate('writer')
            .skip(skip)
            .limit(limit)
            .exec((err, productInfo) => {
                if(err) return res.status(400).json({ success: false, err })
                return res.status(200).json({ 
                    success: true, productInfo,
                    postSize: productInfo.length
                })
            })
    }else {
        Product.find(findArgs)
            .populate('writer')
            .skip(skip)
            .limit(limit)
            .exec((err, productInfo) => {
                if(err) return res.status(400).json({ success: false, err })
                return res.status(200).json({ 
                    success: true, productInfo,
                    postSize: productInfo.length
                })
            })
    }
})

router.get('/products_by_id', (req, res) => {

    let type = req.query.type
    let productIds = req.query.id


    if(type === "array") {
        let ids = req.query.id.split(',')
        console.log(ids)
        productIds = ids;
    }

    //productId를 이용해서 DB에서 productId와 같은 상품의 정보를 가져옵니다.
    Product.find({ _id: { $in: productIds } })
    .populate("writer")
    .exec((err, product) => {
        if(err) return res.status(400).json({ success: false, err})
        return res.status(200).send(product)
    })

})
module.exports = router;

