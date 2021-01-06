const express = require('express');
const router = express.Router();
const { User } = require("../models/User");

const { auth } = require("../middleware/auth");
const { Product } = require('../models/Product');

const { Payment } = require("../models/Payment");
const async = require('async');

//=================================
//             User
//=================================

router.get("/auth", auth, (req, res) => {
    res.status(200).json({
        _id: req.user._id,
        isAdmin: req.user.role === 0 ? false : true,
        isAuth: true,
        email: req.user.email,
        name: req.user.name,
        lastname: req.user.lastname,
        role: req.user.role,
        image: req.user.image,
        cart: req.user.cart,
        history: req.user.history
    });
});

router.post("/register", (req, res) => {

    const user = new User(req.body);

    user.save((err, doc) => {
        if (err) return res.json({ success: false, err });
        return res.status(200).json({
            success: true
        });
    });
});

router.post("/login", (req, res) => {
    User.findOne({ email: req.body.email }, (err, user) => {
        if (!user)
            return res.json({
                loginSuccess: false,
                message: "Auth failed, email not found"
            });

        user.comparePassword(req.body.password, (err, isMatch) => {
            if (!isMatch)
                return res.json({ loginSuccess: false, message: "Wrong password" });

            user.generateToken((err, user) => {
                if (err) return res.status(400).send(err);
                res.cookie("w_authExp", user.tokenExp);
                res
                    .cookie("w_auth", user.token)
                    .status(200)
                    .json({
                        loginSuccess: true, userId: user._id
                    });
            });
        });
    });
});

router.get("/logout", auth, (req, res) => {
    User.findOneAndUpdate({ _id: req.user._id }, { token: "", tokenExp: "" }, (err, doc) => {
        if (err) return res.json({ success: false, err });
        return res.status(200).send({
            success: true
        });
    });
});

router.post("/addToCart", auth, (req, res) => {
    
    //User 콜렉션에 해당 유저의 정보를 가져옵니다.
    User.findOne({ _id: req.user._id },
    (err, userInfo) => {
        //가져온 정보에서 카트에다 넣으려하는 상품이 이미 들어 있는지 확인

        let duplicate = false;
        userInfo.cart.forEach((item) => {
            if(item.id === req.body.productId) {
                duplicate = true;
            }
        })

        //상품이 이미 있을때
        if(duplicate) {
            User.findOneAndUpdate(
                { _id: req.user._id, "cart.id": req.body.productId },
                { $inc: { "cart.$.quantity": 1 }},
                { new: true },
                (err, userInfo) => {
                    if(err) return res.status(400).json({success: false, err})
                    return res.status(200).send(userInfo.cart)
                } 
            )
        }
        //상품이 없을때
        else {
            console.log('1');
            User.findOneAndUpdate(
                { _id: req.user._id},
                {
                    $push: {
                        cart: {
                            id: req.body.productId,
                            quantity: 1,
                            date: Date.now()
                        }
                    }
                },
                { new: true },
                (err, userInfo) => {
                    if(err) return res.status(400).json({success:false, err})
                    return res.status(200).send(userInfo.cart)
                }
            )
        }
    })
});

router.get('/removeFromCart', auth, (req, res) => {
    
    //카트안에 내가 지우려고 한 상품을 지워주고
    //카트 정보는 User 콜렉션에 있다.
    //지울때는 $pull을 쓴다.
    User.findOneAndUpdate(
        { _id: req.user._id },
        {
            $pull:
            { cart: { id: req.query.id }}
        },
        { new: true},
        (err, userInfo) => {
            if(err) return res.status(400).json({success: false, err})
            
            let cart = userInfo.cart;
            let array = cart.map(item => (
                item.id
            ))

            //product 콜렉션에 현재 남아있는 상품들의 정보를 다시 가져와야됩니다.
            Product.find({ _id: { $in: array }})
            .populate("writer")
            .exec((err, productInfo) => {
                return res.status(200).json({
                    productInfo,
                    cart
                })
            })
        }
    )
})


router.post('/SuccessBuy', auth, (req, res) => {
    //1.User 콜렉션의 history필드안에 간단한 결제 정보를 넣습니다.
    let history = [];
    let transactionData = {};

    req.body.cartDetail.forEach((item) => {
        history.push({
            dateOfPurchase: Date.now(),
            name: item.title,
            id: item._id,
            price: item.price,
            quantity: item.quantity,
            paymentId: req.body.paymentData.paymentId
        })
    })

    //2.Payment 콜렉션 안에 자세한 결제 정보 넣어주기 (누가 결제를 했고, 페이팔이 전달해준 정보, 무엇을 샀는지)
    //누가 결제를 했는지
    transactionData.user = {
        id: req.user._id,
        name: req.user._name,
        email: req.user._email
    }
    //paypal정보
    transactionData.data = req.body.paymentData
    //무슨 상품을 샀는지
    transactionData.product = history

    //history 정보 User 콜렉션의 history 필드에 저장
    User.findOneAndUpdate(
        { _id: req.user._id },
        { $push: { history: history }, $set: { cart: [] }},
        { new: true },
        (err, userInfo) => {
            if(err) return res.json({ success: false , err })

            const payment = new Payment(transactionData)

            payment.save((err, doc) => {
                if (err) return res.json({ success : false, err })

                //3.Product 콜렉션 안에 있는 sold 필드 정보 업데이트
                
                // 업데이트 전에 알아야 할 게 있습니다.

                // 상품 당 몇개의 quantity를 샀는지
                let products = [];

                doc.product.forEach(item => {
                    products.push({ id: item.id, quantity: item.quantity })
                })

                //만들어진 products 배열을 가지고 Product 콜렉션을 이용해서 업데이트해야되는데
                //products가 말 그대로 배열이라서 하나만 있을 수도 있지만 여러개가 있다면
                //여기있는 id와 Product의 모든 상품의 id를 하나씩 매칭해서 변경하고 해야되면
                //결국엔 for문 이용이 불가피 해지고 이걸 쓰게 되면 소스가 복잡해지고 지저분해집니다.
                //이에 대한 해결책으로 async 모듈의 eachSeries를 사용해서 극복해 나갑시다.

                //eachSeries(컨트롤할 데이터, 데이터를 컨트롤하는 함수)
                async.eachSeries(products, (item, callback) => {
                    Product.findOneAndUpdate(
                        { _id: item.id },
                        {
                            $inc: {
                                sold: item.quantity
                            }
                        },
                        { new: false },
                        callback
                    )
                }, (err, doc) => {
                    if(err) return res.status(400).json({success : false, err})
                    res.status(200).json({success: true , cart: userInfo.cart, cartDetail: [] })
                })
            })
        }
    )
})

module.exports = router;
