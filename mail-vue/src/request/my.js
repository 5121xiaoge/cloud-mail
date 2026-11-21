import http from '@/axios/index.js';

export function loginUserInfo(accountId) {
    return http.get('/my/loginUserInfo', {params: {accountId}})
}

export function resetPassword(oldPassword, password) {
    return http.put('/my/resetPassword', {oldPassword, password})
}

export function userDelete() {
    return http.delete('/my/delete')
}

