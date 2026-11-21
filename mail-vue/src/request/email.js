import http from '@/axios/index.js';

export function emailList(accountId, allReceive, emailId, timeSort, size, type, signal, full = 1, searchParams = {}) {
    const {type: searchType, text, startDate, endDate} = searchParams
    return http.get('/email/list', {params: {accountId, allReceive, emailId, timeSort, size, type, full, searchType, text, startDate, endDate}, signal})
}

export function emailDelete(emailIds) {
    return http.delete('/email/delete?emailIds=' + emailIds)
}

export function emailLatest(emailId, accountId, allReceive, deliveryId) {
    return http.get('/email/latest', {params: {emailId, accountId, allReceive, deliveryId}, noMsg: true, timeout: 35 * 1000})
}

export function emailRead(emailIds) {
    return http.put('/email/read', {emailIds})
}

export function emailSend(form,progress) {
    return http.post('/email/send', form,{
        onUploadProgress: (e) => {
            progress(e)
        },
        noMsg: true
    })
}
