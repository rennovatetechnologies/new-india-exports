const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    razorpayOrderId: {
        type: String,
        required: true,
        unique: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'INR'
    },
    status: {
        type: String,
        enum: ['created', 'paid', 'failed'],
        default: 'created'
    },
    customerDetails: {
        name: String,
        email: String,
        phone: String,
        address: String,
        country: String
    },
    bookingDetails: {
        shipment: String,
        category: String,
        subProducts: String,
        quantity: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Order', orderSchema);
