const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const paymentSchema = mongoose.Schema({
    user: {
        type: Array,
        default: []
    },
    data: {
        type: Array,
        default: []
    },
    product: {
        type: Array,
        default: []
    }
}, { timestamps: true })
//timestamps: 자동적으로 create/update시간이 들어간다.

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = { Payment }