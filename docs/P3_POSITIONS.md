# P3 战术局面样例

棋龄1最老，坐标从0开始。所有权威输入都是完整合法moves；参考附件与实验发现分开标注。保存全部已检测例，Markdown展示每类前三例。几何威胁变化不是强制杀证明。

## expiry-lock

Detected 74, saved 74.

### experiment: C/normal-tactical/opening-02/20260929/true/60 / ply 30

Moves: [14,15,20,21,26,8,27,29,1,6,25,24,7,19,4,18,12,20,21,14,8,9,1,15,25,13,16,27,4,3]

```text
.  X3 .  O6 X6 . 
.  .  X2 O2 .  . 
.  O4 O1 O3 X5 . 
.  .  .  X1 .  . 
.  X4 .  O5 .  . 
.  .  .  .  .  . 
```

详情见 [expiry-lock.json](../positions/expiry-lock.json)，id=29e0b14061102fa421b3ea4398511dc7e2a769b02c98bf168231c0acc31278c3。

### experiment: C/normal-tactical/opening-05/20260929/true/60 / ply 36

Moves: [31,5,2,33,12,19,14,20,15,21,16,13,22,34,6,1,10,4,7,9,24,3,2,15,21,14,13,19,6,20,10,8,26,22,24,18]

```text
.  .  .  .  .  . 
X3 .  O4 .  X4 . 
.  X2 O1 .  .  . 
O6 O2 O3 X1 O5 . 
X6 .  X5 .  .  . 
.  .  .  .  .  . 
```

详情见 [expiry-lock.json](../positions/expiry-lock.json)，id=f5167734354130d5f9e30edf95f6b5c6e7ed068abdeb5fb826d2b93ae082db1e。

### experiment: C/normal-tactical/opening-06/20260929/true/60 / ply 50

Moves: [9,30,27,34,26,7,19,25,21,15,20,22,8,14,16,31,6,9,34,27,24,21,15,18,22,28,29,14,1,8,7,20,26,13,16,21,19,27,34,15,9,10,24,14,20,28,7,16,13,22]

```text
.  .  .  .  .  . 
.  X5 .  X2 O2 . 
.  X6 O3 O1 O5 . 
.  .  X4 .  O6 . 
X3 .  .  .  O4 . 
.  .  .  .  X1 . 
```

详情见 [expiry-lock.json](../positions/expiry-lock.json)，id=5cd71eec0bdf1373cdbdab5e9993949e2699c494464d030fa1f4a527410948f4。

## expiring-threat

Detected 190, saved 190.

### experiment: C/normal-tactical/opening-01/20260929/true/60 / ply 26

Moves: [14,15,20,8,21,22,28,1,29,7,25,10,26,27,11,6,17,9,8,20,23,34,13,15,29,21]

```text
.  .  .  .  .  . 
O1 .  X3 O2 .  X1
.  X5 .  O5 .  X2
.  .  O3 O6 .  X4
.  .  .  .  .  X6
.  .  .  .  O4 . 
```

详情见 [expiring-threat.json](../positions/expiring-threat.json)，id=03d53b4f7882a83b6951a6206c30a08b2abcd204e8d4191960d6983d46b6429a。

### experiment: C/normal-tactical/opening-06/20260929/false/60 / ply 52

Moves: [9,30,27,34,26,7,19,25,21,15,20,22,8,14,16,11,6,29,34,17,23,7,27,13,25,28,14,10,9,4,22,21,1,29,11,20,15,13,6,14,7,8,26,19,24,18,21,27,28,16,35,13]

```text
.  .  .  .  .  . 
.  X1 O1 .  .  . 
.  O6 .  .  O5 . 
O3 O2 .  X4 .  . 
X3 .  X2 O4 X5 . 
.  .  .  .  .  X6
```

详情见 [expiring-threat.json](../positions/expiring-threat.json)，id=64cd8935aa3fe73641bc2a69a092c1b81bcc3961eedd7d8801ec5bfa24d8690c。

### experiment: C/normal-tactical/opening-11/20260929/false/60 / ply 35

Moves: [7,14,11,1,5,29,28,21,19,20,2,30,15,6,13,12,24,7,14,9,8,16,22,26,21,20,25,1,0,6,7,14,13,8,31]

```text
X3 O3 .  .  .  . 
O4 X4 O6 .  .  . 
.  X5 O5 .  .  . 
.  .  O2 X1 .  . 
.  X2 O1 .  .  . 
.  X6 .  .  .  . 
```

详情见 [expiring-threat.json](../positions/expiring-threat.json)，id=6278a02b81ad495f006f0c459df9d95c2397fa62dde7c65579000b025e641a4d。

## unique-defense

Detected 184, saved 184.

### experiment: C/normal-tactical/opening-01/20260929/false/60 / ply 8

Moves: [14,15,20,8,21,22,28,1]

```text
.  O4 .  .  .  . 
.  .  O2 .  .  . 
.  .  X1 O1 .  . 
.  .  X2 X3 O3 . 
.  .  .  .  X4 . 
.  .  .  .  .  . 
```

详情见 [unique-defense.json](../positions/unique-defense.json)，id=fc7cd16b514c914aa11bd90a7fa0e8492912ac8830f4f1d3fcaf6855a51d6dd5。

### experiment: C/normal-tactical/opening-01/20260929/false/60 / ply 13

Moves: [14,15,20,8,21,22,28,1,29,7,25,10,26]

```text
.  O4 .  .  .  . 
.  O5 O2 .  O6 . 
.  .  .  O1 .  . 
.  .  X1 X2 O3 . 
.  X5 X6 .  X3 X4
.  .  .  .  .  . 
```

详情见 [unique-defense.json](../positions/unique-defense.json)，id=6a4f2b7284ecd40e656c604e24908ae1ad8af776c28f784e0632f178f914deb6。

### experiment: C/normal-tactical/opening-01/20260929/true/60 / ply 18

Moves: [14,15,20,8,21,22,28,1,29,7,25,10,26,27,11,6,17,9]

```text
.  O1 .  .  .  . 
O5 O2 .  O6 O3 X5
.  .  .  .  .  X6
.  .  .  .  .  . 
.  X3 X4 O4 X1 X2
.  .  .  .  .  . 
```

详情见 [unique-defense.json](../positions/unique-defense.json)，id=0cc6b40bd23a5655a5c006358eb17a031a6d0fc95791758dfc65e2ac12d91ded。

## search-disagreement

Detected 30, saved 30.

### experiment: C/normal-tactical/opening-01/20260929/false/60 / ply 16

Moves: [14,15,20,8,21,22,28,1,29,7,25,10,26,27,9,4]

```text
.  O2 .  .  O6 . 
.  O3 .  X6 O4 . 
.  .  .  .  .  . 
.  .  .  X1 O1 . 
.  X4 X5 O5 X2 X3
.  .  .  .  .  . 
```

详情见 [search-disagreement.json](../positions/search-disagreement.json)，id=64be2b9d355c0b8b9cd2522b948486b976d289a19e7418541216b9b917790b89。

### experiment: C/normal-tactical/opening-01/20260929/false/60 / ply 24

Moves: [14,15,20,8,21,22,28,1,29,7,25,10,26,27,9,4,11,17,22,16,14,20,7,8]

```text
.  .  .  .  O2 . 
.  X6 O6 X2 .  X3
.  .  X5 .  O4 O3
.  .  O5 .  X4 . 
.  .  X1 O1 .  . 
.  .  .  .  .  . 
```

详情见 [search-disagreement.json](../positions/search-disagreement.json)，id=5a2c02457912d93bd2a47a87e05f4a8f15d3a38cda9379ec9848417aa038f69f。

### experiment: C/normal-tactical/opening-01/20260929/false/60 / ply 32

Moves: [14,15,20,8,21,22,28,1,29,7,25,10,26,27,9,4,11,17,22,16,14,20,7,8,25,13,27,28,4,24,3,1]

```text
.  O6 .  X6 X5 . 
.  X2 O2 .  .  . 
.  O3 X1 .  .  . 
.  .  O1 .  .  . 
O5 X3 .  X4 O4 . 
.  .  .  .  .  . 
```

详情见 [search-disagreement.json](../positions/search-disagreement.json)，id=376c3131858c3d52b9d5e6024a924ff5e24f93353aae86db61101e9a68d13290。

## expiry-swing

Detected 595, saved 595.

### experiment: C/normal-tactical/opening-01/20260929/false/60 / ply 56

Moves: [14,15,20,8,21,22,28,1,29,7,25,10,26,27,9,4,11,17,22,16,14,20,7,8,25,13,27,28,4,24,3,1,15,21,14,20,19,16,31,34,13,7,24,9,10,27,21,29,20,25,26,22,8,14,11,16]

```text
.  .  .  .  .  . 
.  .  X5 .  X1 X6
.  .  O5 .  O6 . 
.  .  X3 X2 O4 . 
.  O3 X4 O1 .  O2
.  .  .  .  .  . 
```

详情见 [expiry-swing.json](../positions/expiry-swing.json)，id=3be101f44dc62092e533621cca9aabd1c6455bf478d48ab71fc51759e58b9e58。

### experiment: C/normal-tactical/opening-01/20260929/true/60 / ply 15

Moves: [14,15,20,8,21,22,28,1,29,7,25,10,26,27,11]

```text
.  O3 .  .  .  . 
.  O4 O1 .  O5 X6
.  .  .  .  .  . 
.  .  .  X1 O2 . 
.  X4 X5 O6 X2 X3
.  .  .  .  .  . 
```

详情见 [expiry-swing.json](../positions/expiry-swing.json)，id=d4677017bc7c4aea9825c30a1d2488b6a2615ec9f261752269a2b8514b01a78e。

### experiment: C/normal-tactical/opening-01/20260929/true/60 / ply 20

Moves: [14,15,20,8,21,22,28,1,29,7,25,10,26,27,11,6,17,9,8,20]

```text
.  .  .  .  .  . 
O4 O1 X6 O5 O2 X4
.  .  .  .  .  X5
.  .  O6 .  .  . 
.  X2 X3 O3 .  X1
.  .  .  .  .  . 
```

详情见 [expiry-swing.json](../positions/expiry-swing.json)，id=5de65ed1e5823924d9dde5b804122b80adecb8046f5b3878cf339bbbd62f7d3d。
