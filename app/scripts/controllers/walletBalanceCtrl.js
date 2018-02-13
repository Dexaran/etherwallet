'use strict';
var walletBalanceCtrl = function ($scope, $sce, walletService) {
    $scope.ajaxReq = ajaxReq;
    $scope.erc20Abi = require('../abiDefinitions/erc20abi.json');
    $scope.DEXNS = require('../abiDefinitions/etcAbi.json')[5];
    $scope.DEXNSAddress = $scope.DEXNS.address;
    $scope.erc20Indexes = {
        DECIMALS: 2,
        SYMBOL: 3,
        DEXNSFunction: 5
    };


    $scope.tokensLoaded = true;
    $scope.localToken = {
        contractAdd: "",
        symbol: "",
        decimals: "",
        type: "custom",
        network: ""
    };
    $scope.contract = {
        functions: [],
    };
    $scope.slide = 2;
    $scope.customTokenSymbol = '';
    $scope.customTokenInterval = null;
    walletService.wallet = null;
    $scope.wallet = null;


    $scope.nodeList = nodes.nodeList;
    $scope.alternativeBalance = nodes.alternativeBalance;

    $scope.customTokenField = false;

    $scope.$watch(function () {
        if (walletService.wallet == null) return null;
        return walletService.wallet.getAddressString();
    }, function () {
        if (walletService.wallet == null) return;
        $scope.wallet = walletService.wallet;
    });

    $scope.resetTokenField = function () {

        $scope.customTokenField = false;
        $scope.customTokenDexNSField = false;
        $scope.customTokenSymbol = '';

        $scope.addressDrtv.ensAddressField = '';

    };

    $scope.saveTokenToLocal = function () {




        globalFuncs.saveTokenToLocal($scope.localToken, function (data) {
            if (!data.error) {
                $scope.resetLocalToken();
                $scope.wallet.setTokens();
                $scope.validateLocalToken = $sce.trustAsHtml('');


                $scope.resetTokenField();

                $scope.resetLocalToken();

            } else {
                $scope.notifier.danger(data.msg);
            }
        });
    };

    $scope.resetLocalToken = function () {
        $scope.localToken = {
            contractAdd: "",
            symbol: "",
            decimals: "",
            type: "custom",
            network: ""
        };
    };

    $scope.initContract = function () {
        try {
            $scope.contract.functions = [];
            var tAbi = $scope.erc20Abi;
            for (var i in tAbi) {
                if (tAbi[i].type == "function") {
                    tAbi[i].inputs.map(function (i) {
                        i.value = '';
                    });
                    $scope.contract.functions.push(tAbi[i]);
                }
            }
            ;
        } catch (e) {
            $scope.notifier.danger(e);
        }
    };

    /*

        @param: indexFunc int: the index of the contract method
        @returns: encoded params
     */

    $scope.getTxData = function (indexFunc) {
        var curFunc = $scope.contract.functions[indexFunc];
        var fullFuncName = ethUtil.solidityUtils.transformToFullName(curFunc);
        var funcSig = ethFuncs.getFunctionSignature(fullFuncName);
        var typeName = ethUtil.solidityUtils.extractTypeName(fullFuncName);
        var types = typeName.split(',');
        types = types[0] == "" ? [] : types;
        var values = [];
        for (var i in curFunc.inputs) {
            if (curFunc.inputs[i].value) {
                if (curFunc.inputs[i].type.indexOf('[') !== -1 && curFunc.inputs[i].type.indexOf(']') !== -1) values.push(curFunc.inputs[i].value.split(','));
                else values.push(curFunc.inputs[i].value);
            } else values.push('');
        }
        return '0x' + funcSig + ethUtil.solidityCoder.encodeParams(types, values);
    };

    $scope.readData = function (indexFunc, data) {
        if (!data.error) {
            var curFunc = $scope.contract.functions[indexFunc];
            var outTypes = curFunc.outputs.map(function (i) {
                return i.type;
            });
            var decoded = ethUtil.solidityCoder.decodeParams(outTypes, data.data.replace('0x', ''));
            for (var i in decoded) {
                if (decoded[i] instanceof BigNumber) curFunc.outputs[i].value = decoded[i].toFixed(0);
                else curFunc.outputs[i].value = decoded[i];
            }
        } else throw data.msg;
        return curFunc;
    };

    $scope.$watch(function () {
        return $scope.addressDrtv.ensAddressField;
    }, function (newAddress) {


        if (!$scope.Validator) return;

        $scope.localToken.symbol = '';

        $scope.localToken.decimals = '';

        if ($scope.Validator.isValidAddress(newAddress)) {

            $scope.localToken.symbol = 'loading...';

            $scope.localToken.decimals = 'loading...';


            $scope.getTokenInfo(newAddress);


        }
    });


    $scope.$watch(function () {

        return globalFuncs.getCurNode();
    }, function (newNode) {


        // console.log('new node', newNode);

        $scope.resetLocalToken();

        $scope.resetTokenField();
    });


    // will return custom token symbol if registed as dexNS

    $scope.$watch(function () {
        return $scope.customTokenSymbol;
    }, function (newSymbol, oldSymbol) {
        if (!newSymbol) return;
        //if (newSymbol.length < 3) return;

        if ($scope.customTokenInterval) {
            clearTimeout($scope.customTokenInterval);
        }

        $scope.customTokenInterval = setTimeout(function () {
            var getNameFunction = $scope.contract.functions[$scope.erc20Indexes.DEXNSFunction];
            getNameFunction.inputs[0].value = newSymbol;

            var DEXNSnetwork = 'ETC'; // DexNS network is always ETC!
            $scope.nodeList[$scope.alternativeBalance[DEXNSnetwork].node].lib.getEthCall({
                to: $scope.DEXNSAddress,
                data: $scope.getTxData($scope.erc20Indexes.DEXNSFunction)
            }, function (data) {
                if (data.error) {
                    $scope.notifier.danger('Ops, we\'d had an error communicating with DexNS.');
                    return;

                }

                var outputs = $scope.readData($scope.erc20Indexes.DEXNSFunction, data).outputs;
                var contractAddress = outputs[1].value;
                var contractInfo = outputs[2].value.split('-');

                if (contractAddress === "0x0000000000000000000000000000000000000000") {
                    $scope.resetLocalToken();
                    $scope.notifier.danger('Symbol not found.');
                    return;
                }

                $scope.getTokenInfo(contractAddress, newSymbol);
            });
        }, 1300);
    });

    $scope.$watch('wallet.balance', function () {
        if ($scope.wallet !== null) {
            $scope.setAllBalance();
        }
    });

    $scope.setAllBalance = function () {


        if (!$scope.nodeList) return;
        var setBalance = function (currency) {
            return function (data) {
                if (data.error) {
                    $scope.alternativeBalance[currency].balance = data.msg;
                } else {
                    $scope.alternativeBalance[currency].balance = etherUnits.toEther(data.data.balance, 'wei');
                }
            };
        };
        for (var currency in $scope.alternativeBalance) {
            $scope.nodeList[$scope.alternativeBalance[currency].node].lib.getBalance(
                $scope.wallet.getAddressString(), setBalance(currency),
            )
        }
    }

    $scope.removeTokenFromLocal = function (tokensymbol) {
        globalFuncs.removeTokenFromLocal(tokensymbol, $scope.wallet.tokenObjs);
    }

    $scope.showDisplayOnTrezor = function () {
        return ($scope.wallet != null && $scope.wallet.hwType === 'trezor');
    }

    $scope.displayOnTrezor = function () {
        TrezorConnect.ethereumGetAddress($scope.wallet.path, function () {
        });
    }

    $scope.showDisplayOnLedger = function () {
        return ($scope.wallet != null && $scope.wallet.hwType === 'ledger');
    }

    $scope.displayOnLedger = function () {
        var app = new ledgerEth($scope.wallet.getHWTransport());
        app.getAddress($scope.wallet.path, function () {
        }, true, false);
    };


    /*


    getTokenInfo calls requests for decimals and symbol


    @param: String address. address of contract

    @param: String? symbol. symbol of token



    @returns: void
     */

    $scope.getTokenInfo = function (address, symbol = null) {


        $scope.localToken.contractAdd = address;

        $scope.localToken.network = globalFuncs.getCurNode();

        var request_ = {
            to: address,
            data: $scope.getTxData($scope.erc20Indexes.DECIMALS)
        };


        // call decimals
        ajaxReq.getEthCall(request_, function (data) {

            if (data.error || data.data === '0x') {

                $scope.localToken.decimals = '';
                $scope.localToken.network = '';
                $scope.notifier.danger('Error fetching decimals');
                return;

            }

            $scope.localToken.decimals = $scope.readData($scope.erc20Indexes.DECIMALS, data).outputs[0].value;


        });



        if (symbol) {

            $scope.localToken.symbol = symbol;
            return;

        }
        const request_symbol = Object.assign({}, request_, {data: $scope.getTxData($scope.erc20Indexes.SYMBOL)});

        // call for symbol
        ajaxReq.getEthCall(request_symbol, function (data) {
            if (!data.error && data.data !== '0x') {
                $scope.localToken.symbol = $scope.readData($scope.erc20Indexes.SYMBOL, data).outputs[0].value;
            } else {
                $scope.localToken.symbol = '';
                $scope.localToken.network = '';
                $scope.notifier.danger('Error fetching symbol');
            }


        });


    }

};
module.exports = walletBalanceCtrl;
